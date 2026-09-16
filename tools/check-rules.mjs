#!/usr/bin/env node
/**
 * check-rules.mjs — vérifie les règles du jeu sans navigateur.
 *
 * `maze.js`, `entities.js`, `level.js` et `rng.js` ne touchent ni au DOM ni au
 * canevas : on peut donc les charger tels quels dans Node et simuler des
 * parties entières, bien plus vite et plus sûrement qu'en jouant à la main.
 *
 * Usage : node tools/check-rules.mjs
 */

import { readFileSync } from 'node:fs';
import { Maze, distancesFrom, DELTA, DIRECTIONS, generateMaze } from '../js/maze.js';
import { Level, campaignConfig, SPEEDS } from '../js/level.js';
import { Rng } from '../js/rng.js';
import { randomConfig, SIZES, DIFFICULTIES, levelSize, writeUrl } from '../js/config.js';
import { compterMetresPasseport } from '../js/passeport.js';

const data = JSON.parse(readFileSync(new URL('../assets/data/mazes.json', import.meta.url), 'utf8'));
const campaign = data.mazes.map(m => ({
  id: m.id, start: m.start, maze: Maze.fromPacked(m.n, m.walls),
}));
const config = campaignConfig(campaign);
const DT = 16.67;

let failures = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };

/**
 * Direction qui rapproche de la cible, d'après la carte des distances.
 *
 * On l'évalue depuis la cellule **de destination** du héros, pas celle qu'il
 * quitte : une touche maintenue enchaîne le pas suivant dès l'arrivée, il faut
 * donc lui donner la direction d'après, sinon il dépasse d'une case.
 */
function gradient(maze, i, j, dist) {
  const n = maze.n;
  let best = null, bestD = dist[j * n + i];
  for (const dir of DIRECTIONS) {
    if (maze.hasWall(i, j, dir)) continue;
    const [di, dj] = DELTA[dir];
    const d = dist[(j + dj) * n + (i + di)];
    if (d >= 0 && d < bestD) { bestD = d; best = dir; }
  }
  return best;
}

/* ── Traversée de chaque niveau de la campagne ────────────────────────── */

for (let k = 0; k < config.levels.length; k++) {
  const spec = config.levels[k];
  const level = new Level(spec, new Rng(`test#${k}`));
  const n = level.maze.n;
  console.log(`\n${campaign[k].id} — ${n}×${n}, ${spec.minotaurs} minotaure(s), sortie « ${spec.exit} »`);

  const fromStart = distancesFrom(level.maze, ...spec.start);
  const dmax = Math.max(...fromStart);
  check(level.exitDistance >= dmax * 0.6,
    `sortie à ${level.exitDistance} cases du départ (maximum ${dmax}, seuil ${Math.ceil(dmax * 0.6)})`);
  check(level.minotaurs.length === spec.minotaurs, `${level.minotaurs.length} minotaure(s) placé(s)`);

  for (const m of level.minotaurs) {
    const d = Math.abs(m.i - spec.start[0]) + Math.abs(m.j - spec.start[1]);
    if (d < Math.max(3, Math.floor(n / 4))) { check(false, `minotaure apparu à ${d} cases du héros`); break; }
  }

  // Navigation seule : `survivalOdds = 50` rend la marche lente infaillible,
  // pour que ce test ne dépende pas d'un jet de dé.
  const toExit = distancesFrom(level.maze, level.exit.i, level.exit.j);
  const needed = toExit[spec.start[1] * n + spec.start[0]];
  let outcome = null, elapsed = 0;
  while (outcome === null && elapsed < 400000) {
    const dir = gradient(level.maze, level.hero.i, level.hero.j, toExit);
    outcome = level.update(DT, { direction: dir, slowWalk: true }, 50);
    elapsed += DT;
  }
  check(outcome === spec.exit, `arrivée : ${outcome} (attendu ${spec.exit})`);
  check(level.hero.traveled === needed,
    `compteur = ${level.hero.traveled} pas, plus court chemin = ${needed} cases`);
  console.log(`    (${(elapsed / 1000).toFixed(1)} s simulées en marche lente)`);
}

/* ── Les minotaures ne traversent pas les murs ────────────────────────── */

console.log('\nminotaures — 20 000 images simulées');
{
  const level = new Level(config.levels[3], new Rng('mino'));
  let steps = 0, breaches = 0, reversals = 0;
  for (let f = 0; f < 20000; f++) {
    for (const m of level.minotaurs) {
      const was = { i: m.i, j: m.j, dir: m.dir };
      m.update(level.maze, DT, level.rng);
      // Un pas s'engage dès que la cellule visée change ; le comparer à l'état
      // de `moving` raterait les pas enchaînés dans la même image.
      if (m.i !== was.i || m.j !== was.j) {
        steps++;
        const dir = DIRECTIONS.find(d => DELTA[d][0] === m.i - m.fromI && DELTA[d][1] === m.j - m.fromJ);
        if (level.maze.hasWall(m.fromI, m.fromJ, dir)) breaches++;
        const options = DIRECTIONS.filter(d => !level.maze.hasWall(m.fromI, m.fromJ, d));
        if (was.dir !== null && dir === (was.dir + 2) % 4 && options.length > 1) reversals++;
      }
    }
  }
  check(steps > 10000, `${steps} pas engagés`);
  check(breaches === 0, `${breaches} passage(s) à travers un mur`);
  check(reversals === 0, `${reversals} demi-tour(s) hors impasse`);
}

/* ── Jet de survie ────────────────────────────────────────────────────── */

console.log('\nrencontres — 4 000 contacts simulés');
{
  const trial = (slow, odds) => {
    const level = new Level(config.levels[1], new Rng('odds'));
    let deaths = 0;
    for (let t = 0; t < 4000; t++) {
      const m = level.minotaurs[0];
      m.contact = false;
      // On place le minotaure sur le héros pour forcer un contact franc.
      m.i = m.fromI = level.hero.i;
      m.j = m.fromJ = level.hero.j;
      m.t = 1;
      if (level.resolveEncounters(slow, odds)) deaths++;
    }
    return deaths / 4000;
  };
  const slowRate = trial(true, 49);
  const fastRate = trial(false, 49);
  check(Math.abs(slowRate - 0.02) < 0.012, `marche lente : ${(slowRate * 100).toFixed(1)} % de morts (attendu ~2 %)`);
  check(fastRate === 1, `en courant : ${(fastRate * 100).toFixed(0)} % de morts (attendu 100 %)`);
  const nightmare = trial(true, 45);
  check(Math.abs(nightmare - 0.1) < 0.03, `réglage Cauchemar : ${(nightmare * 100).toFixed(1)} % de morts (attendu ~10 %)`);
}

/* ── Cadences et reproductibilité ─────────────────────────────────────── */

console.log('\ncadences');
check(SPEEDS.heroNormal < SPEEDS.minotaur, `course ${SPEEDS.heroNormal} ms/case < minotaure ${SPEEDS.minotaur}`);
check(SPEEDS.heroSlow > SPEEDS.minotaur, `marche lente ${SPEEDS.heroSlow} ms/case > minotaure ${SPEEDS.minotaur}`);

console.log('\nreproductibilité');
{
  const build = () => new Level(config.levels[2], new Rng('graine-test'));
  const a = build(), b = build();
  const same = a.exit.i === b.exit.i && a.exit.j === b.exit.j &&
    a.minotaurs.every((m, i) => m.i === b.minotaurs[i].i && m.j === b.minotaurs[i].j);
  check(same, 'même graine → même sortie et mêmes minotaures');
  const c = new Level(config.levels[2], new Rng('autre-graine'));
  check(c.exit.i !== a.exit.i || c.exit.j !== a.exit.j, 'graine différente → sortie différente');
}

/* ── Générateurs ──────────────────────────────────────────────────────── */

/** Mesure la topologie d'un labyrinthe : connexité, boucles, profil de degrés. */
function topology(maze) {
  const n = maze.n;
  const dist = distancesFrom(maze, 0, 0);
  let reachable = 0, passages = 0;
  const degrees = [0, 0, 0, 0, 0];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (dist[j * n + i] >= 0) reachable++;
      let d = 0;
      for (const dir of DIRECTIONS) if (!maze.hasWall(i, j, dir)) d++;
      degrees[d]++;
      passages += d;
    }
  }
  return {
    cells: n * n, reachable, passages: passages / 2, degrees,
    // Un labyrinthe parfait est connexe et compte exactement n²−1 passages :
    // un de moins et il serait coupé, un de plus et il aurait une boucle.
    perfect: reachable === n * n && passages / 2 === n * n - 1,
  };
}

console.log('\ngénérateurs — 12 grilles par algorithme');
// Un backtracker peut produire un croisement en croix : quand la pile
// redescend sur une cellule déjà traversée, elle peut lui creuser une troisième
// puis une quatrième ouverture. C'est rare — les grilles d'origine en comptent
// 0, 0 et 2 — donc on vérifie un taux, pas une absence.
for (const [algo, expected] of [['backtracker', { maxDeadEnds: 0.16, maxCross: 0.005 }],
                                ['prim', { minDeadEnds: 0.22, minCross: 1 }]]) {
  let allPerfect = true, deadEnds = 0, cross = 0, cells = 0;
  for (let t = 0; t < 12; t++) {
    const n = [8, 10, 17, 25, 34][t % 5];
    const topo = topology(generateMaze(n, new Rng(`gen-${algo}-${t}`), algo));
    if (!topo.perfect) allPerfect = false;
    deadEnds += topo.degrees[1];
    cross += topo.degrees[4];
    cells += topo.cells;
  }
  const rate = deadEnds / cells;
  check(allPerfect, `${algo} : les 12 grilles sont des labyrinthes parfaits`);
  console.log(`    ${(100 * rate).toFixed(1)} % d'impasses, ${cross} croisement(s) en croix`);
  if (expected.maxDeadEnds !== undefined) {
    check(rate < expected.maxDeadEnds, `${algo} : peu d'impasses, comme les grilles d'origine (< ${100 * expected.maxDeadEnds} %)`);
    check(cross / cells < expected.maxCross,
      `${algo} : croisements en croix marginaux (${(100 * cross / cells).toFixed(2)} %, seuil ${100 * expected.maxCross} %)`);
  } else {
    check(rate > expected.minDeadEnds, `${algo} : beaucoup d'impasses (> ${100 * expected.minDeadEnds} %)`);
    check(cross >= expected.minCross, `${algo} : présence de carrefours`);
  }
}

console.log('\ngénérateurs — reproductibilité');
{
  const a = generateMaze(17, new Rng('meme-graine'), 'backtracker');
  const b = generateMaze(17, new Rng('meme-graine'), 'backtracker');
  const c = generateMaze(17, new Rng('autre'), 'backtracker');
  check(a.cells.every((v, i) => v === b.cells[i]), 'même graine → grille identique au bit près');
  check(!a.cells.every((v, i) => v === c.cells[i]), 'graine différente → grille différente');
}

/* ── Donjons engendrés : composition et jouabilité ────────────────────── */

console.log('\ndonjons engendrés');
for (const taille of Object.keys(SIZES)) {
  for (const difficulte of Object.keys(DIFFICULTIES)) {
    const mode = DIFFICULTIES[difficulte];
    const config = randomConfig({ seed: `${taille}-${difficulte}`, taille, difficulte });
    let ok = config.levels.length === mode.levels;
    ok &&= config.levels[0].minotaurs === 0;
    ok &&= config.levels.at(-1).exit === 'treasure';
    ok &&= config.levels.slice(0, -1).every(l => l.exit === 'stairs');
    ok &&= config.levels.every((l, k) => l.maze.n === levelSize(SIZES[taille].n, k, mode.levels));
    ok &&= config.levels.every(l => topology(l.maze).perfect);
    // Il doit rester assez de cellules éloignées pour y poser les minotaures.
    ok &&= config.levels.every(l => l.minotaurs < l.maze.n * l.maze.n * 0.5);
    const total = config.levels.reduce((n, l) => n + l.minotaurs, 0);
    check(ok, `${taille} / ${difficulte} : ${mode.levels} niveaux, ${total} minotaures`);
  }
}

console.log('\ndonjon engendré — traversée complète');
{
  const config = randomConfig({ seed: 'traversee', taille: 'grand', difficulte: 'difficile' });
  let cleared = 0;
  for (let k = 0; k < config.levels.length; k++) {
    const spec = config.levels[k];
    const level = new Level(spec, new Rng(`traversee#${k}`));
    const n = level.maze.n;
    const toExit = distancesFrom(level.maze, level.exit.i, level.exit.j);
    let outcome = null, elapsed = 0;
    while (outcome === null && elapsed < 600000) {
      outcome = level.update(DT, {
        direction: gradient(level.maze, level.hero.i, level.hero.j, toExit),
        slowWalk: true,
      }, 50);
      elapsed += DT;
    }
    if (outcome === spec.exit) cleared++;
  }
  check(cleared === config.levels.length,
    `${cleared} / ${config.levels.length} niveaux franchis en pilotage automatique`);
}

/* ── Passeport : le compteur de mètres et l'adresse ───────────────────── */

console.log('\npasseport — compteur de mètres');
{
  // Un espace de joueur en mémoire : le vrai vient de `commun/passeport.js`,
  // qui n'existe que dans un navigateur.
  const espace = () => {
    const donnees = new Map();
    return {
      ecritures: 0,
      getItem: k => donnees.get(k) ?? null,
      setItem(k, v) { this.ecritures++; donnees.set(k, String(v)); },
    };
  };

  const invite = espace();
  check(compterMetresPasseport('2026-09-16', 5, null) === null, 'mode invité : rien n’est compté');
  check(invite.ecritures === 0, 'mode invité : rien n’est écrit');

  const e = espace();
  check(compterMetresPasseport('2026-09-16', 40, e) === 40, 'premiers mètres du jour');
  check(compterMetresPasseport('2026-09-16', 105, e) === 145, 'les mètres s’additionnent dans la journée');
  check(compterMetresPasseport('2026-09-16', 5, e) === 150, 'le seuil de 150 m est atteint pas à pas');
  check(compterMetresPasseport('2026-09-17', 7, e) === 7, 'le compteur repart à zéro le lendemain');

  // Une valeur abîmée ne doit ni lever, ni faire perdre la journée en cours.
  e.setItem('maze.passeport', '{cassé');
  check(compterMetresPasseport('2026-09-17', 3, e) === 3, 'compteur illisible : on repart de zéro');
  e.setItem('maze.passeport', JSON.stringify({ jour: '2026-09-17', metres: 'beaucoup' }));
  check(compterMetresPasseport('2026-09-17', 3, e) === 3, 'total non entier : on repart de zéro');

  // La boucle appelle le compteur à chaque image : une image sans pas franchi
  // ne doit pas toucher au stockage.
  const avant = e.ecritures;
  const rien = [0, -1, 1.5, NaN].every(m => compterMetresPasseport('2026-09-17', m, e) === null);
  check(rien && e.ecritures === avant, 'une image sans pas franchi n’écrit rien');
}

console.log('\npasseport — le profil reste dans l’adresse');
{
  const meta = { mode: 'aleatoire', seed: 'oubliette-482', taille: 'moyen', difficulte: 'normal', trace: 'backtracker' };
  const adresse = search => ({ pathname: '/maze-for-adventurers/', search });
  const params = url => new URLSearchParams(url.slice(url.indexOf('?') + 1));
  const avec = writeUrl(meta, adresse('?profil=abcdefgh-1234'));
  check(params(avec).get('profil') === 'abcdefgh-1234',
    'une partie lancée avec un passeport garde son profil');
  check(params(avec).get('graine') === 'oubliette-482', 'la graine partageable est toujours là');
  check(!writeUrl(meta, adresse('')).includes('profil'), 'sans passeport, aucun profil vide n’apparaît');
  check(params(writeUrl({ mode: 'campagne' }, adresse('?profil=x'))).get('profil') === 'x',
    'la campagne aussi garde le profil');
}

/* ── Interface : aucun bouton orphelin ────────────────────────────────── */

// Un bouton dont l'action n'est traitée nulle part ne produit aucune erreur :
// il ne fait simplement rien. C'est exactement ce qui est arrivé aux boutons
// « Son » et « Pause », restés inertes sans que rien ne le signale.
console.log('\ninterface');
{
  const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const html = read('index.html');
  const sources = ['js/ui.js', 'js/main.js'].map(read).join('\n');

  const declared = [...new Set([...html.matchAll(/data-action="([a-z]+)"/g)].map(m => m[1]))];
  const handled = new Set([
    ...[...sources.matchAll(/case '([a-z]+)':/g)].map(m => m[1]),
    ...[...sources.matchAll(/action === '([a-z]+)'/g)].map(m => m[1]),
  ]);
  const orphans = declared.filter(a => !handled.has(a));
  check(orphans.length === 0,
    `${declared.length} actions déclarées, toutes traitées${orphans.length ? ` — SAUF ${orphans.join(', ')}` : ''}`);

  // Même logique pour les identifiants : `getElementById` sur un id absent
  // renvoie null, et l'erreur ne surgit qu'au premier usage.
  const wanted = [...new Set([...sources.matchAll(/getElementById\('([\w-]+)'\)/g)].map(m => m[1]))];
  const missing = wanted.filter(id => !html.includes(`id="${id}"`));
  check(missing.length === 0,
    `${wanted.length} identifiants référencés, tous présents${missing.length ? ` — SAUF ${missing.join(', ')}` : ''}`);
}

console.log(`\n${failures === 0 ? 'Toutes les vérifications passent.' : `${failures} ÉCHEC(S)`}`);
process.exit(failures ? 1 : 0);
