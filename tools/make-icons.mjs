#!/usr/bin/env node
/**
 * make-icons.mjs — fabrique les icônes du jeu.
 *
 * Deux familles, pour deux usages :
 *
 * - **minotaure** — l'icône d'application et celle du hub. Le sprite du jeu
 *   posé sur un labyrinthe estompé : c'est l'image qui raconte le jeu.
 * - **labyrinthe** — la favicone. À 32 px un minotaure devient une bouillie ;
 *   un labyrinthe géométrique, non.
 *
 * Le motif de fond est un vrai labyrinthe, produit par le générateur du jeu
 * avec une graine fixe : l'icône est littéralement un donjon de Maze for
 * Adventurers, et elle se régénère à l'identique.
 *
 * Usage : node tools/make-icons.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateMaze, NORTH, EAST, SOUTH, WEST } from '../js/maze.js';
import { Rng } from '../js/rng.js';
import { decodePng, encodePng } from './png.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'assets', 'icons');
const SPRITE = join(ROOT, 'assets', 'img', 'minotaur.png');

const GRID = 7;
const SEED = 'maze-for-adventurers';

const BACKGROUND = [0x17, 0x12, 0x0f];
const WALL_BRIGHT = [0xe8, 0xdd, 0xcc];
const WALL_DIM = [0x33, 0x28, 0x20];
const TREASURE = [0xff, 0xcc, 0x4d];

/** Part laissée en marge : la zone que les masques ronds d'Android rognent. */
const INSET = 0.14;

/**
 * On dessine à quatre fois la taille voulue puis on réduit par moyenne. C'est
 * du lissage à peu de frais, et sans lui les petits formats seraient crénelés.
 */
const SUPER = 4;

/* ── Toile ────────────────────────────────────────────────────────────── */

function canvas(s) {
  const px = Buffer.alloc(s * s * 3);
  for (let i = 0; i < s * s; i++) {
    px[i * 3] = BACKGROUND[0];
    px[i * 3 + 1] = BACKGROUND[1];
    px[i * 3 + 2] = BACKGROUND[2];
  }
  return px;
}

function drawMaze(px, s, color) {
  const maze = generateMaze(GRID, new Rng(SEED));
  const inset = s * INSET;
  const cell = (s - 2 * inset) / GRID;
  const w = Math.max(SUPER, s * 0.032);
  const at = k => inset + k * cell;

  const fill = (x0, y0, x1, y1) => {
    const ax = Math.max(0, Math.round(x0)), ay = Math.max(0, Math.round(y0));
    const bx = Math.min(s, Math.round(x1)), by = Math.min(s, Math.round(y1));
    for (let y = ay; y < by; y++) {
      for (let x = ax; x < bx; x++) {
        const k = (y * s + x) * 3;
        px[k] = color[0]; px[k + 1] = color[1]; px[k + 2] = color[2];
      }
    }
  };

  // Deux passes : les segments se recouvrent aux angles, ce qui les ferme
  // proprement sans traitement à part.
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const wall = j === GRID ? maze.hasWall(i, GRID - 1, SOUTH) : maze.hasWall(i, j, NORTH);
      if (wall) fill(at(i) - w / 2, at(j) - w / 2, at(i + 1) + w / 2, at(j) + w / 2);
    }
  }
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const wall = i === GRID ? maze.hasWall(GRID - 1, j, EAST) : maze.hasWall(i, j, WEST);
      if (wall) fill(at(i) - w / 2, at(j) - w / 2, at(i) + w / 2, at(j + 1) + w / 2);
    }
  }
  return { inset, cell, at };
}

function drawTreasure(px, s, geom) {
  const c = GRID >> 1;
  const cx = geom.at(c) + geom.cell / 2, cy = geom.at(c) + geom.cell / 2;
  const r = geom.cell * 0.32;
  for (let y = Math.round(cy - r); y <= cy + r; y++) {
    for (let x = Math.round(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const k = (y * s + x) * 3;
      px[k] = TREASURE[0]; px[k + 1] = TREASURE[1]; px[k + 2] = TREASURE[2];
    }
  }
}

/* ── Sprite ───────────────────────────────────────────────────────────── */

/**
 * Le sprite du minotaure est bicolore et **entièrement opaque** : un rouge
 * (208, 2, 27) sur blanc. Ce fond blanc est invisible en jeu, où le sol du
 * labyrinthe est lui aussi blanc, mais il ferait un carré sur l'icône.
 *
 * Les deux teintes étant très séparées, l'alpha se reconstruit exactement au
 * lieu d'être seuillé : un pixel vaut `rouge × a + blanc × (1 − a)`, donc sur
 * le canal vert `a = (255 − vert) / (255 − 2)`. Les bords anticrénelés
 * retrouvent ainsi leur dégradé au lieu de laisser un liseré clair.
 */
function keyOutWhite(img) {
  const { width, height, channels, data } = img;
  const out = Buffer.alloc(width * height * 4);
  const RED = [208, 2, 27];
  for (let i = 0; i < width * height; i++) {
    const green = data[i * channels + 1];
    const alpha = Math.max(0, Math.min(255, Math.round((255 - green) * 255 / 253)));
    out[i * 4] = RED[0];
    out[i * 4 + 1] = RED[1];
    out[i * 4 + 2] = RED[2];
    out[i * 4 + 3] = alpha;
  }
  return { width, height, channels: 4, data: out };
}

/** Rogne le sprite sur ses pixels réellement opaques. */
function opaqueBounds(img) {
  const { width, height, channels, data } = img;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + channels - 1] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Compose le sprite sur la toile, à l'échelle et centré. Échantillonnage
 * bilinéaire : le sprite fait 200 px et l'icône jusqu'à 2048 en interne, donc
 * on agrandit — au plus proche voisin, les cornes seraient en escalier.
 */
function drawSprite(px, s, img, coverage) {
  const box = opaqueBounds(img);
  const scale = (s * coverage) / Math.max(box.width, box.height);
  const dw = box.width * scale, dh = box.height * scale;
  const ox = (s - dw) / 2, oy = (s - dh) / 2;
  const { width, channels, data } = img;

  const sample = (fx, fy) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const out = [0, 0, 0, 0];
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const sx = Math.min(box.minX + box.width - 1, Math.max(box.minX, x0 + dx));
        const sy = Math.min(box.minY + box.height - 1, Math.max(box.minY, y0 + dy));
        const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
        const k = (sy * width + sx) * channels;
        out[0] += data[k] * w;
        out[1] += data[k + 1] * w;
        out[2] += data[k + 2] * w;
        out[3] += data[k + 3] * w;
      }
    }
    return out;
  };

  for (let y = Math.max(0, Math.floor(oy)); y < Math.min(s, Math.ceil(oy + dh)); y++) {
    for (let x = Math.max(0, Math.floor(ox)); x < Math.min(s, Math.ceil(ox + dw)); x++) {
      const [r, g, b, a] = sample(
        box.minX + (x - ox) / scale,
        box.minY + (y - oy) / scale,
      );
      if (a <= 1) continue;
      const alpha = a / 255;
      const k = (y * s + x) * 3;
      px[k] = Math.round(r * alpha + px[k] * (1 - alpha));
      px[k + 1] = Math.round(g * alpha + px[k + 1] * (1 - alpha));
      px[k + 2] = Math.round(b * alpha + px[k + 2] * (1 - alpha));
    }
  }
}

/* ── Réduction et écriture ────────────────────────────────────────────── */

function downsample(px, s, size) {
  const out = Buffer.alloc(size * size * 3);
  const n = SUPER * SUPER;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let dy = 0; dy < SUPER; dy++) {
        for (let dx = 0; dx < SUPER; dx++) {
          const k = ((y * SUPER + dy) * s + x * SUPER + dx) * 3;
          sum[0] += px[k]; sum[1] += px[k + 1]; sum[2] += px[k + 2];
        }
      }
      const k = (y * size + x) * 3;
      out[k] = Math.round(sum[0] / n);
      out[k + 1] = Math.round(sum[1] / n);
      out[k + 2] = Math.round(sum[2] / n);
    }
  }
  return out;
}

const sprite = keyOutWhite(decodePng(readFileSync(SPRITE)));

function render(size, kind) {
  const s = size * SUPER;
  const px = canvas(s);
  if (kind === 'labyrinthe') {
    drawTreasure(px, s, drawMaze(px, s, WALL_BRIGHT));
  } else {
    // Le labyrinthe reste lisible en filigrane sans disputer la vedette.
    drawMaze(px, s, WALL_DIM);
    drawSprite(px, s, sprite, 0.78);
  }
  return downsample(px, s, size);
}

mkdirSync(OUT, { recursive: true });
const PLAN = [
  [32, 'labyrinthe', 'icon-32.png'],
  [180, 'minotaure', 'icon-180.png'],
  [192, 'minotaure', 'icon-192.png'],
  [512, 'minotaure', 'icon-512.png'],
];

for (const [size, kind, name] of PLAN) {
  const png = encodePng(size, render(size, kind));
  writeFileSync(join(OUT, name), png);
  console.log(`  ${name.padEnd(14)} ${String(size).padStart(3)} px  ${kind.padEnd(11)} ${String(png.length).padStart(6)} o`);
}
console.log(`\n${PLAN.length} icônes écrites (graine « ${SEED} », grille ${GRID}×${GRID}).`);
