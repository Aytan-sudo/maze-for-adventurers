#!/usr/bin/env node
/**
 * make-icons.mjs — fabrique les icônes du jeu.
 *
 * Le motif est un vrai labyrinthe, produit par le générateur du jeu avec une
 * graine fixe : l'icône est donc littéralement un donjon de Maze for
 * Adventurers, et elle se régénère à l'identique.
 *
 * Encodeur PNG écrit ici même : les murs ne sont que des rectangles, il n'y a
 * donc rien à faire qu'une bibliothèque graphique ferait mieux, et le script
 * reste sans dépendance ni outil externe.
 *
 * Usage : node tools/make-icons.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMaze, NORTH, EAST, SOUTH, WEST } from '../js/maze.js';
import { Rng } from '../js/rng.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');

const SIZES = [32, 180, 192, 512];
const GRID = 7;
const SEED = 'maze-for-adventurers';

const BACKGROUND = [0x17, 0x12, 0x0f];
const WALL = [0xe8, 0xdd, 0xcc];
const TREASURE = [0xff, 0xcc, 0x4d];

/** Part de l'icône occupée par le labyrinthe : le reste est la zone sûre que
 *  les masques circulaires d'Android peuvent rogner sans rien couper. */
const INSET = 0.14;

/* ── Encodeur PNG ─────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgb) {
  const stride = size * 3;
  const raw = Buffer.alloc(size * (1 + stride));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + stride)] = 0; // filtre « aucun » : l'image est trop petite
    rgb.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // 8 bits par canal
  ihdr[9] = 2;  // RVB sans transparence
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── Tracé ────────────────────────────────────────────────────────────── */

/**
 * Dessine à quatre fois la taille voulue puis réduit par moyenne : c'est du
 * lissage à peu de frais, et sans lui les murs obliques du petit format
 * seraient crénelés.
 */
const SUPER = 4;

function render(size) {
  const s = size * SUPER;
  const pixels = Buffer.alloc(s * s * 3);
  for (let i = 0; i < s * s; i++) {
    pixels[i * 3] = BACKGROUND[0];
    pixels[i * 3 + 1] = BACKGROUND[1];
    pixels[i * 3 + 2] = BACKGROUND[2];
  }

  const fill = (x0, y0, x1, y1, color) => {
    const ax = Math.max(0, Math.round(x0)), ay = Math.max(0, Math.round(y0));
    const bx = Math.min(s, Math.round(x1)), by = Math.min(s, Math.round(y1));
    for (let y = ay; y < by; y++) {
      for (let x = ax; x < bx; x++) {
        const k = (y * s + x) * 3;
        pixels[k] = color[0];
        pixels[k + 1] = color[1];
        pixels[k + 2] = color[2];
      }
    }
  };

  const maze = generateMaze(GRID, new Rng(SEED));
  const inset = s * INSET;
  const span = s - 2 * inset;
  const cell = span / GRID;
  const w = Math.max(SUPER, s * 0.032);
  const at = k => inset + k * cell;

  // Les murs se dessinent en deux passes, horizontale puis verticale : les
  // segments se recouvrent aux angles, ce qui les ferme sans traitement à part.
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const wall = j === GRID ? maze.hasWall(i, GRID - 1, SOUTH) : maze.hasWall(i, j, NORTH);
      if (wall) fill(at(i) - w / 2, at(j) - w / 2, at(i + 1) + w / 2, at(j) + w / 2, WALL);
    }
  }
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const wall = i === GRID ? maze.hasWall(GRID - 1, j, EAST) : maze.hasWall(i, j, WEST);
      if (wall) fill(at(i) - w / 2, at(j) - w / 2, at(i) + w / 2, at(j + 1) + w / 2, WALL);
    }
  }

  // Le trésor au centre : un point d'or qui donne à l'icône son seul accent.
  const c = GRID >> 1;
  const cx = at(c) + cell / 2, cy = at(c) + cell / 2;
  const r = cell * 0.32;
  for (let y = Math.round(cy - r); y <= cy + r; y++) {
    for (let x = Math.round(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const k = (y * s + x) * 3;
      pixels[k] = TREASURE[0];
      pixels[k + 1] = TREASURE[1];
      pixels[k + 2] = TREASURE[2];
    }
  }

  // Réduction par moyenne des blocs SUPER × SUPER.
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let dy = 0; dy < SUPER; dy++) {
        for (let dx = 0; dx < SUPER; dx++) {
          const k = ((y * SUPER + dy) * s + x * SUPER + dx) * 3;
          sum[0] += pixels[k]; sum[1] += pixels[k + 1]; sum[2] += pixels[k + 2];
        }
      }
      const k = (y * size + x) * 3;
      const n = SUPER * SUPER;
      out[k] = Math.round(sum[0] / n);
      out[k + 1] = Math.round(sum[1] / n);
      out[k + 2] = Math.round(sum[2] / n);
    }
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, render(size));
  const name = `icon-${size}.png`;
  writeFileSync(join(OUT, name), png);
  console.log(`  assets/icons/${name.padEnd(14)} ${String(png.length).padStart(6)} o`);
}
console.log(`\n${SIZES.length} icônes écrites (graine « ${SEED} », grille ${GRID}×${GRID}).`);
