/**
 * Composition d'une partie : campagne d'origine ou donjon engendré.
 *
 * Les deux modes produisent la même structure, celle que `Game` consomme :
 *   { name, survivalOdds, levels: [{ maze, start, minotaurs, exit }] }
 */

import { generateMaze } from './maze.js';
import { Rng } from './rng.js';
import { campaignConfig } from './level.js';

export const SIZES = {
  petit: { n: 10, label: 'Petit', hint: '10 × 10' },
  moyen: { n: 17, label: 'Moyen', hint: '17 × 17' },
  grand: { n: 25, label: 'Grand', hint: '25 × 25' },
  immense: { n: 34, label: 'Immense', hint: '34 × 34' },
};

export const DIFFICULTIES = {
  promenade: {
    label: 'Promenade', levels: 2, minotaurFactor: 0, survivalOdds: 49,
    hint: 'Aucun minotaure, juste le plaisir de se perdre',
  },
  normal: {
    label: 'Normal', levels: 4, minotaurFactor: 1, survivalOdds: 49,
    hint: 'Le dosage du jeu d\'origine',
  },
  difficile: {
    label: 'Difficile', levels: 6, minotaurFactor: 2, survivalOdds: 49,
    hint: 'Deux fois plus de minotaures, six niveaux',
  },
  cauchemar: {
    label: 'Cauchemar', levels: 8, minotaurFactor: 3, survivalOdds: 45,
    hint: 'Huit niveaux, et marcher lentement ne sauve plus qu\'une fois sur dix',
  },
};

export const ALGORITHMS = {
  backtracker: { label: 'Sinueux', hint: 'Longs couloirs, peu d\'impasses — le style du jeu d\'origine' },
  prim: { label: 'Buissonnant', hint: 'Beaucoup d\'impasses courtes et de carrefours' },
};

export const DEFAULTS = { taille: 'moyen', difficulte: 'normal', trace: 'backtracker' };

/**
 * Densité maximale de minotaures, au dernier niveau et en difficulté Normal.
 * Calée sur l'original : 16 minotaures sur les 1 156 cellules du 34×34.
 */
const MAX_DENSITY = 0.014;

/**
 * Taille du labyrinthe au niveau `k`.
 *
 * Le réglage donne la taille du **dernier** niveau ; les précédents montent en
 * puissance depuis un peu moins de la moitié. On n'inflige donc pas huit
 * grilles géantes d'affilée, sans tomber non plus sur un premier niveau si
 * minuscule qu'il se traverse sans réfléchir — d'où le plancher à 8.
 */
export function levelSize(maxN, k, levels) {
  if (levels <= 1) return maxN;
  const minN = Math.min(maxN, Math.max(8, Math.round(maxN / 2.5)));
  return Math.round(minN + (maxN - minN) * (k / (levels - 1)));
}

/** Nombre de minotaures au niveau `k` : nul au premier, maximal au dernier. */
export function levelMinotaurs(n, k, levels, factor) {
  if (levels <= 1 || factor === 0) return 0;
  return Math.round(n * n * MAX_DENSITY * factor * (k / (levels - 1)));
}

const SEED_WORDS = [
  'minotaure', 'dedale', 'ariane', 'labyrinthe', 'torche', 'crypte', 'oubliette',
  'gargouille', 'sarcophage', 'obsidienne', 'cyclope', 'chimere', 'griffon',
  'catacombe', 'grimoire', 'talisman', 'basilic', 'reliquaire',
];

/** Graine lisible et facile à recopier, du genre « oubliette-482 ». */
export function randomSeed() {
  const word = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  return `${word}-${Math.floor(Math.random() * 900) + 100}`;
}

/**
 * Construit un donjon engendré.
 * @param {{seed, taille, difficulte, trace}} options
 */
export function randomConfig(options) {
  const { seed, taille, difficulte, trace } = { ...DEFAULTS, ...options };
  const size = SIZES[taille] ?? SIZES[DEFAULTS.taille];
  const mode = DIFFICULTIES[difficulte] ?? DIFFICULTIES[DEFAULTS.difficulte];
  const algo = ALGORITHMS[trace] ? trace : DEFAULTS.trace;

  const levels = [];
  for (let k = 0; k < mode.levels; k++) {
    const n = levelSize(size.n, k, mode.levels);
    // Une graine par niveau : ajouter un niveau ne redessine pas les autres.
    const maze = generateMaze(n, new Rng(`${seed}~${k}~${algo}`), algo);
    levels.push({
      maze,
      start: [Math.floor(n / 2), Math.floor(n / 2)],
      minotaurs: levelMinotaurs(n, k, mode.levels, mode.minotaurFactor),
      exit: k === mode.levels - 1 ? 'treasure' : 'stairs',
    });
  }

  return {
    name: `${size.label} · ${mode.label}`,
    survivalOdds: mode.survivalOdds,
    levels,
    meta: { mode: 'aleatoire', seed, taille, difficulte, trace },
  };
}

/** La campagne d'origine, avec ses quatre grilles extraites du `.sb3`. */
export function originalConfig(campaign) {
  return { ...campaignConfig(campaign), meta: { mode: 'campagne' } };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Partage par lien
 * ──────────────────────────────────────────────────────────────────────────── */

/** Lit une configuration dans l'URL. `null` si elle n'en contient aucune. */
export function readUrl(search = location.search) {
  const p = new URLSearchParams(search);
  if (p.get('mode') === 'campagne') return { mode: 'campagne' };
  const seed = p.get('graine');
  if (!seed) return null;
  return {
    mode: 'aleatoire',
    seed,
    taille: SIZES[p.get('taille')] ? p.get('taille') : DEFAULTS.taille,
    difficulte: DIFFICULTIES[p.get('difficulte')] ? p.get('difficulte') : DEFAULTS.difficulte,
    trace: ALGORITHMS[p.get('trace')] ? p.get('trace') : DEFAULTS.trace,
  };
}

/** Écrit la configuration dans l'URL, pour qu'un simple copier-coller la partage. */
export function writeUrl(meta, adresse = location) {
  const p = new URLSearchParams();
  if (meta.mode === 'campagne') {
    p.set('mode', 'campagne');
  } else {
    p.set('graine', meta.seed);
    p.set('taille', meta.taille);
    p.set('difficulte', meta.difficulte);
    if (meta.trace !== DEFAULTS.trace) p.set('trace', meta.trace);
  }
  // Le passeport voyage dans l'adresse : l'effacer en réécrivant celle-ci ferait
  // changer de joueur au premier rechargement.
  const profil = new URLSearchParams(adresse.search).get('profil');
  if (profil !== null) p.set('profil', profil);
  return `${adresse.pathname}?${p}`;
}
