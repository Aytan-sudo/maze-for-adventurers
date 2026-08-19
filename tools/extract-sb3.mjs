#!/usr/bin/env node
/**
 * extract-sb3.mjs — régénère assets/ depuis Old_Scratch/Maze for Adventurers.sb3
 *
 * Aucune dépendance npm : le ZIP est lu ici, les PNG décodés par ./png.mjs.
 * Outils externes attendus dans le PATH :
 *   - ffmpeg (ré-encodage audio)  — requis
 *   - cwebp  (compression images) — optionnel, repli sur PNG
 *
 * Le script est idempotent : il peut être relancé à volonté.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, pngSize } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SB3 = join(ROOT, 'Old_Scratch', 'Maze for Adventurers.sb3');
const OUT = join(ROOT, 'assets');

/* ────────────────────────────────────────────────────────────────────────────
 * Ce qu'on extrait, désigné par (sprite, costume/son) plutôt que par hachage :
 * c'est lisible et ça résiste à une réexportation du projet Scratch.
 * ──────────────────────────────────────────────────────────────────────────── */

const MAZES = [
  { id: 'level1', target: 'Maze_1', costume: 'Maze_10_10', start: [5, 4] },
  { id: 'level2', target: 'Maze_2', costume: 'Maze_17_17', start: [8, 8] },
  { id: 'level3', target: 'Maze_3', costume: 'maze500', start: [8, 8] },
  { id: 'level4', target: 'Maze_4', costume: 'Maze_34_34', start: [17, 16] },
];

const IMAGES = [
  { id: 'start_menu', target: 'Stage', costume: 'Start_Menu' },
  { id: 'rules', target: 'Stage', costume: 'rules' },
  { id: 'dead', target: 'Stage', costume: 'dead' },
  { id: 'victory', target: 'Stage', costume: 'Victory' },
  { id: 'credits', target: 'Stage', costume: 'credits' },
  { id: 'hero', target: 'Hero', costume: 'hero2' },
  { id: 'minotaur', target: 'minotaur', costume: 'minotaur' },
  { id: 'stairs', target: 'stairs', costume: 'stairs' },
  { id: 'treasure', target: 'Treasure', costume: 'open-treasure-chest' },
];

const SOUNDS = [
  { id: 'menu', target: 'Stage', sound: 'Menu', bitrate: '96k' },
  { id: 'adventure', target: 'Stage', sound: 'Adventure', bitrate: '96k' },
  { id: 'credits', target: 'Stage', sound: 'credits', bitrate: '96k' },
  { id: 'dead', target: 'Stage', sound: 'Dead', bitrate: '128k' },
  // 20 ms : le ré-encodage MP3 ajouterait plus de silence que de son utile.
  { id: 'pop', target: 'Maze_1', sound: 'pop', raw: true },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Lecture ZIP (méthodes « stocké » et « deflate », sans ZIP64)
 * ──────────────────────────────────────────────────────────────────────────── */

function readZip(buf) {
  // L'annuaire central est repéré depuis la fin : son offset est le seul moyen
  // fiable de localiser les entrées quand un commentaire suit.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('archive ZIP invalide : fin d\'annuaire central introuvable');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('entrée d\'annuaire central corrompue');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const fnLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + fnLen);

    // L'en-tête local a ses propres longueurs de champs variables, différentes
    // de celles de l'annuaire central : il faut les relire ici.
    const lFnLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lFnLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    files.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    p += 46 + fnLen + extraLen + commentLen;
  }
  return files;
}

/** Les costumes SVG de Scratch enveloppent souvent un PNG en base64. */
function embeddedPng(svgText) {
  const m = svgText.match(/base64,([A-Za-z0-9+/=\s]+)"/);
  return m ? Buffer.from(m[1].replace(/\s/g, ''), 'base64') : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Analyse d'un labyrinthe bitmap → grille de murs
 * ──────────────────────────────────────────────────────────────────────────── */

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Regroupe des indices consécutifs : [4,5,20,21] → [[4,5],[20,21]] */
function runs(indices) {
  const out = [];
  for (const i of indices) {
    const last = out[out.length - 1];
    if (last && i === last[last.length - 1] + 1) last.push(i);
    else out.push([i]);
  }
  return out;
}

function analyzeMaze(img) {
  const { width, height, channels, data } = img;
  const isBlack = (x, y) => {
    const i = (y * width + x) * channels;
    const alpha = channels === 4 || channels === 2 ? data[i + channels - 1] : 255;
    return alpha > 128 && data[i] < 128;
  };

  // Boîte englobante du tracé noir : le labyrinthe ne remplit pas toute l'image.
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlack(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('aucun pixel noir : ce n\'est pas un labyrinthe');

  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  // Les lignes de grille traversantes donnent le pas ; les murs internes, plus
  // courts, sont écartés par le seuil de 50 %.
  const fullRows = [];
  for (let y = minY; y <= maxY; y++) {
    let n = 0;
    for (let x = minX; x <= maxX; x++) if (isBlack(x, y)) n++;
    if (n > bw * 0.5) fullRows.push(y);
  }
  const fullCols = [];
  for (let x = minX; x <= maxX; x++) {
    let n = 0;
    for (let y = minY; y <= maxY; y++) if (isBlack(x, y)) n++;
    if (n > bh * 0.5) fullCols.push(x);
  }

  const rowRuns = runs(fullRows), colRuns = runs(fullCols);
  const thickness = Math.min(...[...rowRuns, ...colRuns].map(r => r.length));

  // Le pas est le PGCD des écarts entre lignes traversantes : robuste même si
  // beaucoup de lignes de grille sont absentes du tracé.
  const offsets = [
    ...rowRuns.map(r => r[0] - minY),
    ...colRuns.map(r => r[0] - minX),
  ].filter(v => v > 0);
  const pitch = offsets.reduce((a, b) => gcd(a, b));

  const span = bw - thickness;
  if (span % pitch !== 0 || bw !== bh) {
    throw new Error(`géométrie inattendue : boîte ${bw}×${bh}, pas ${pitch}, épaisseur ${thickness}`);
  }
  const n = span / pitch;

  // Un point pile sur la ligne peut tomber sur un pixel d'anticrénelage : on
  // teste toute l'épaisseur du trait.
  const wallAt = (x, y) => {
    for (let d = 0; d < thickness; d++) {
      if (x + d < width && isBlack(x + d, y)) return true;
      if (y + d < height && isBlack(x, y + d)) return true;
    }
    return false;
  };

  const half = Math.floor(pitch / 2);
  // V[i][j] : mur vertical au bord ouest de la cellule (i, j)
  const V = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n }, (_, j) => wallAt(minX + i * pitch, minY + j * pitch + half)));
  // H[i][j] : mur horizontal au bord nord de la cellule (i, j)
  const H = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => wallAt(minX + i * pitch + half, minY + j * pitch)));

  return { n, pitch, thickness, V, H, bbox: [minX, minY, maxX, maxY] };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Grille de murs → format du moteur
 * ──────────────────────────────────────────────────────────────────────────── */

/** 2 bits par cellule (nord, ouest), MSB d'abord, ordre ligne par ligne. */
function packWalls(n, V, H) {
  const bits = 2 * n * n;
  const bytes = Buffer.alloc(Math.ceil(bits / 8));
  let b = 0;
  const push = v => { if (v) bytes[b >> 3] |= 0x80 >> (b & 7); b++; };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) { push(H[i][j]); push(V[i][j]); }
  }
  return bytes.toString('base64');
}

/** Inverse de packWalls, avec reconstitution du bord extérieur implicite. */
function unpackWalls(n, b64) {
  const bytes = Buffer.from(b64, 'base64');
  const V = Array.from({ length: n + 1 }, () => Array(n).fill(false));
  const H = Array.from({ length: n }, () => Array(n + 1).fill(false));
  let b = 0;
  const pull = () => { const v = (bytes[b >> 3] & (0x80 >> (b & 7))) !== 0; b++; return v; };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) { H[i][j] = pull(); V[i][j] = pull(); }
  }
  for (let j = 0; j < n; j++) V[n][j] = true;
  for (let i = 0; i < n; i++) H[i][n] = true;
  return { V, H };
}

/** Le bord extérieur n'est pas stocké : on vérifie qu'il est bien fermé. */
function checkBorder(n, V, H) {
  for (let j = 0; j < n; j++) if (!V[0][j] || !V[n][j]) return false;
  for (let i = 0; i < n; i++) if (!H[i][0] || !H[i][n]) return false;
  return true;
}

/** Un labyrinthe parfait : toutes les cellules atteignables, aucune boucle. */
function analyzeTopology(n, V, H) {
  const seen = new Set(['0,0']);
  const queue = [[0, 0]];
  let passages = 0;
  while (queue.length) {
    const [i, j] = queue.shift();
    const moves = [
      [i - 1, j, V[i][j]], [i + 1, j, V[i + 1][j]],
      [i, j - 1, H[i][j]], [i, j + 1, H[i][j + 1]],
    ];
    for (const [ni, nj, wall] of moves) {
      if (wall || ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const key = `${ni},${nj}`;
      if (!seen.has(key)) { seen.add(key); queue.push([ni, nj]); }
    }
  }
  const degrees = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let d = 0;
      if (!V[i][j]) d++;
      if (!V[i + 1][j]) d++;
      if (!H[i][j]) d++;
      if (!H[i][j + 1]) d++;
      degrees[d]++;
      passages += d;
    }
  }
  passages /= 2;
  return {
    reachable: seen.size,
    cells: n * n,
    perfect: seen.size === n * n && passages === n * n - 1,
    deadEnds: degrees[1],
    corridors: degrees[2],
    tJunctions: degrees[3],
    crossroads: degrees[4],
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Outils externes
 * ──────────────────────────────────────────────────────────────────────────── */

function has(cmd) {
  try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

const bytes = n => n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(1)} Ko` : `${(n / 1048576).toFixed(2)} Mo`;

/* ────────────────────────────────────────────────────────────────────────────
 * Programme principal
 * ──────────────────────────────────────────────────────────────────────────── */

function main() {
  if (!existsSync(SB3)) throw new Error(`introuvable : ${SB3}`);
  if (!has('ffmpeg')) throw new Error('ffmpeg est requis (brew install ffmpeg)');
  const webp = has('cwebp');
  if (!webp) console.warn('⚠︎  cwebp absent : les images restent en PNG (brew install webp)');

  console.log(`Lecture de ${SB3}`);
  const zip = readZip(readFileSync(SB3));
  const project = JSON.parse(zip.get('project.json').toString('utf8'));

  const target = name => {
    const t = project.targets.find(t => t.name === name);
    if (!t) throw new Error(`sprite introuvable : ${name}`);
    return t;
  };
  const costumeFile = (targetName, costumeName) => {
    const c = target(targetName).costumes.find(c => c.name === costumeName);
    if (!c) throw new Error(`costume introuvable : ${targetName}/${costumeName}`);
    return c.md5ext;
  };
  const soundAsset = (targetName, soundName) => {
    const s = target(targetName).sounds.find(s => s.name === soundName);
    if (!s) throw new Error(`son introuvable : ${targetName}/${soundName}`);
    return s;
  };
  /** Renvoie le PNG d'un costume, qu'il soit direct ou embarqué dans un SVG. */
  const costumePng = (targetName, costumeName) => {
    const file = costumeFile(targetName, costumeName);
    const buf = zip.get(file);
    if (!buf) throw new Error(`asset absent de l'archive : ${file}`);
    if (file.endsWith('.png')) return buf;
    const inner = embeddedPng(buf.toString('utf8'));
    if (!inner) throw new Error(`aucun PNG embarqué dans ${file}`);
    return inner;
  };

  for (const dir of ['img', 'audio', 'data']) {
    rmSync(join(OUT, dir), { recursive: true, force: true });
    mkdirSync(join(OUT, dir), { recursive: true });
  }

  /* ── Labyrinthes ─────────────────────────────────────────────────────── */
  console.log('\nLabyrinthes');
  const mazes = MAZES.map(spec => {
    const img = decodePng(costumePng(spec.target, spec.costume));
    const { n, pitch, thickness, V, H } = analyzeMaze(img);
    if (!checkBorder(n, V, H)) throw new Error(`${spec.id} : bord extérieur incomplet`);
    const topo = analyzeTopology(n, V, H);
    if (!topo.perfect) throw new Error(`${spec.id} : le labyrinthe n'est pas parfait (${topo.reachable}/${topo.cells})`);

    const walls = packWalls(n, V, H);
    // Le format binaire est ce que consommera le moteur : on relit ce qu'on
    // vient d'écrire plutôt que de faire confiance à l'empaquetage.
    const back = unpackWalls(n, walls);
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j < n; j++) {
        if (back.V[i][j] !== V[i][j]) throw new Error(`${spec.id} : aller-retour incohérent, mur vertical (${i},${j})`);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= n; j++) {
        if (back.H[i][j] !== H[i][j]) throw new Error(`${spec.id} : aller-retour incohérent, mur horizontal (${i},${j})`);
      }
    }

    // Le taux d'impasses est le discriminant fiable : un backtracker récursif
    // creuse de longs couloirs (~10 %), Prim et Kruskal en font trois fois plus.
    const algo = topo.deadEnds / topo.cells < 0.15 ? 'backtracker' : 'Prim/Kruskal';
    const pct = v => `${(100 * v / topo.cells).toFixed(1)} %`;
    console.log(
      `  ${spec.id.padEnd(7)} ${String(n).padStart(2)}×${n}  pas ${String(pitch).padStart(2)} px  ` +
      `impasses ${pct(topo.deadEnds).padStart(6)}  couloirs ${pct(topo.corridors).padStart(6)}  ` +
      `croix ${String(topo.crossroads).padStart(2)}  → ${algo}`
    );
    return { id: spec.id, n, start: spec.start, source: `${spec.target}/${spec.costume}`, algo, walls };
  });

  const mazesJson = {
    format: 'mfa-maze-1',
    note: '2 bits par cellule (nord, ouest), MSB d\'abord, ordre ligne par ligne ; bord extérieur implicite',
    mazes,
  };
  writeFileSync(join(OUT, 'data', 'mazes.json'), JSON.stringify(mazesJson, null, 2));
  console.log(`  → assets/data/mazes.json (${bytes(readFileSync(join(OUT, 'data', 'mazes.json')).length)})`);

  /* ── Images ──────────────────────────────────────────────────────────── */
  console.log('\nImages');
  const images = {};
  let imgBefore = 0, imgAfter = 0;
  for (const spec of IMAGES) {
    const png = costumePng(spec.target, spec.costume);
    const { width, height } = pngSize(png);
    const pngPath = join(OUT, 'img', `${spec.id}.png`);
    writeFileSync(pngPath, png);
    let file = `img/${spec.id}.png`;
    let size = png.length;

    if (webp) {
      const webpPath = join(OUT, 'img', `${spec.id}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', '88', '-alpha_q', '100', '-m', '6', pngPath, '-o', webpPath]);
      const webpSize = readFileSync(webpPath).length;
      // Sur les petits sprites à plat, le PNG gagne parfois : on garde le plus léger.
      if (webpSize < png.length) {
        rmSync(pngPath);
        file = `img/${spec.id}.webp`;
        size = webpSize;
      } else {
        rmSync(webpPath);
      }
    }

    images[spec.id] = { file, w: width, h: height };
    imgBefore += png.length;
    imgAfter += size;
    console.log(`  ${spec.id.padEnd(11)} ${String(width).padStart(4)}×${String(height).padEnd(4)} ${bytes(png.length).padStart(9)} → ${bytes(size).padStart(9)}  ${file.split('.').pop()}`);
  }
  console.log(`  → ${bytes(imgBefore)} → ${bytes(imgAfter)} (${Math.round(100 * imgAfter / imgBefore)} %)`);

  /* ── Sons ────────────────────────────────────────────────────────────── */
  console.log('\nSons');
  const audio = {};
  let sndBefore = 0, sndAfter = 0;
  for (const spec of SOUNDS) {
    const meta = soundAsset(spec.target, spec.sound);
    const src = zip.get(meta.md5ext);
    if (!src) throw new Error(`asset absent de l'archive : ${meta.md5ext}`);
    const duration = meta.sampleCount / meta.rate;
    const ext = spec.raw ? meta.md5ext.split('.').pop() : 'mp3';
    const outPath = join(OUT, 'audio', `${spec.id}.${ext}`);

    if (spec.raw) {
      writeFileSync(outPath, src);
    } else {
      const tmp = join(OUT, 'audio', `.tmp-${spec.id}`);
      writeFileSync(tmp, src);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', spec.bitrate, outPath]);
      rmSync(tmp);
    }

    const size = readFileSync(outPath).length;
    audio[spec.id] = { file: `audio/${spec.id}.${ext}`, duration: Number(duration.toFixed(2)) };
    sndBefore += src.length;
    sndAfter += size;
    console.log(`  ${spec.id.padEnd(11)} ${(duration.toFixed(1) + ' s').padStart(8)} ${bytes(src.length).padStart(9)} → ${bytes(size).padStart(9)}`);
  }
  console.log(`  → ${bytes(sndBefore)} → ${bytes(sndAfter)} (${Math.round(100 * sndAfter / sndBefore)} %)`);

  /* ── Manifeste ───────────────────────────────────────────────────────── */
  writeFileSync(join(OUT, 'data', 'assets.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'Old_Scratch/Maze for Adventurers.sb3',
    images,
    audio,
  }, null, 2));

  console.log(`\nTotal assets/ : ${bytes(imgAfter + sndAfter)} (contre ${bytes(imgBefore + sndBefore)} dans le .sb3)`);
}

main();
