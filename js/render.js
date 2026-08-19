/**
 * Rendu — tout est exprimé dans la scène logique 480 × 360 héritée de Scratch,
 * et mis à l'échelle au dernier moment. Les constantes de jeu restent donc
 * lisibles et comparables à celles du projet d'origine.
 *
 * Les murs sont tracés en vectoriel, pas en bitmap : le labyrinthe reste net
 * quelle que soit la résolution, y compris sur écran à forte densité.
 */

import { NORTH, EAST, SOUTH, WEST } from './maze.js';

export const STAGE_W = 480, STAGE_H = 360;

/**
 * Le carré de jeu, aux mêmes coordonnées que dans le Scratch d'origine : le
 * tracé y occupait 340 unités centrées sur la scène. Conserver ces valeurs fait
 * que les tailles de cellule retombent exactement sur celles de l'original
 * (34, 20 et 10 unités pour les grilles 10×10, 17×17 et 34×34).
 */
export const MAZE_BOX = { x: 70, y: 10, size: 340 };

/** Les sprites d'origine occupaient tous ~72 % de la largeur d'une cellule. */
export const SPRITE_SCALE = 0.72;

export const COLORS = {
  page: '#14110f',
  floor: '#ffffff',
  wall: '#1a1a1a',
};

export const cellSize = n => MAZE_BOX.size / n;

/** Centre de la cellule (i, j) en coordonnées de scène. */
export function cellCenter(n, i, j) {
  const c = cellSize(n);
  return { x: MAZE_BOX.x + (i + 0.5) * c, y: MAZE_BOX.y + (j + 0.5) * c };
}

/**
 * Épaisseur de trait, en unités de scène. Proportionnelle à la cellule pour
 * rester lisible sur les grandes grilles, mais bornée pour que le 10×10 ne
 * devienne pas un gros gribouillis.
 */
export function wallWidth(n) {
  return Math.max(0.9, Math.min(2.4, cellSize(n) * 0.09));
}

/**
 * Gère le canevas : dimensionnement en pixels réels, mise à l'échelle vers la
 * scène logique, et bandes noires si le conteneur n'est pas en 4:3.
 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    /**
     * Où poser la scène dans la hauteur disponible : 0,5 la centre. En portrait
     * avec commandes tactiles, on la remonte pour rassembler l'espace perdu
     * sous le jeu, là où se posent le D-pad et la bascule.
     */
    this.verticalBias = 0.5;
  }

  /** À rappeler au redimensionnement de la fenêtre ou au changement d'écran. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // On contient la scène plutôt que de la couvrir : rien n'est jamais rogné.
    this.scale = Math.min(w / STAGE_W, h / STAGE_H);
    this.offsetX = (w - STAGE_W * this.scale) / 2;
    this.offsetY = (h - STAGE_H * this.scale) * this.verticalBias;
  }

  /** Repart d'une scène propre, transformée en unités logiques. */
  begin() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.page;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    return ctx;
  }

  /** Pixels réels par unité de scène — utile pour dimensionner les textures. */
  get pixelsPerUnit() {
    return this.scale;
  }

  /**
   * Emplacement de la scène dans le canevas, en pixels CSS. C'est ce qui permet
   * de caler une surcouche HTML sur le cadre du jeu plutôt que sur le canevas
   * entier, bandes noires comprises.
   */
  get cssRect() {
    const dpr = window.devicePixelRatio || 1;
    return {
      left: this.offsetX / dpr,
      top: this.offsetY / dpr,
      width: (STAGE_W * this.scale) / dpr,
      height: (STAGE_H * this.scale) / dpr,
    };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Texture de labyrinthe
 *
 * Un labyrinthe est statique le temps d'un niveau : on le trace une fois dans
 * un canevas hors écran, puis on se contente de le recopier à chaque image.
 * Sur le 34×34, cela évite de re-tracer plus de 2 000 segments par image.
 * ──────────────────────────────────────────────────────────────────────────── */

let cache = { maze: null, px: 0, texture: null };

function buildTexture(maze, px) {
  const n = maze.n;
  const unit = px / MAZE_BOX.size;
  const cell = px / n;
  const lineWidth = wallWidth(n) * unit;

  // Un trait est centré sur sa ligne : sans marge, la moitié extérieure des
  // murs du pourtour tomberait hors de la texture et le cadre paraîtrait deux
  // fois plus fin que les murs intérieurs.
  const pad = Math.ceil(lineWidth / 2);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px + 2 * pad;
  const g = canvas.getContext('2d');

  g.fillStyle = COLORS.floor;
  g.fillRect(0, 0, canvas.width, canvas.height);

  g.translate(pad, pad);
  g.strokeStyle = COLORS.wall;
  g.lineWidth = lineWidth;
  g.lineCap = 'square';
  g.lineJoin = 'miter';

  const path = new Path2D();

  // Les murs alignés et contigus sont fusionnés en un seul segment : moins de
  // sous-chemins, et surtout des jonctions franches au lieu de bouts de traits
  // accolés qui laissent apparaître des encoches aux angles.
  for (let j = 0; j <= n; j++) {
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const wall = i < n && (j === n
        ? maze.hasWall(i, n - 1, SOUTH)
        : maze.hasWall(i, j, NORTH));
      if (wall && start < 0) start = i;
      if (!wall && start >= 0) {
        path.moveTo(start * cell, j * cell);
        path.lineTo(i * cell, j * cell);
        start = -1;
      }
    }
  }
  for (let i = 0; i <= n; i++) {
    let start = -1;
    for (let j = 0; j <= n; j++) {
      const wall = j < n && (i === n
        ? maze.hasWall(n - 1, j, EAST)
        : maze.hasWall(i, j, WEST));
      if (wall && start < 0) start = j;
      if (!wall && start >= 0) {
        path.moveTo(i * cell, start * cell);
        path.lineTo(i * cell, j * cell);
        start = -1;
      }
    }
  }

  g.stroke(path);
  // `pad` est en pixels de texture ; le convertir en unités de scène permet de
  // replacer la texture exactement sur son réseau au moment du dessin.
  return { canvas, padUnits: pad / unit };
}

/** Texture du labyrinthe à la résolution demandée, mémorisée entre les images. */
export function mazeTexture(maze, px) {
  if (cache.maze === maze && cache.px === px) return cache.texture;
  cache = { maze, px, texture: buildTexture(maze, px) };
  return cache.texture;
}

/** Dessine le labyrinthe dans son carré de jeu. */
export function drawMaze(ctx, maze, pixelsPerUnit) {
  // La texture fait un multiple entier de la taille de grille : chaque cellule
  // occupe alors exactement le même nombre de pixels, sans quoi les murs
  // paraissent d'épaisseur inégale d'un couloir à l'autre.
  const wanted = MAZE_BOX.size * pixelsPerUnit;
  const px = Math.max(4, Math.ceil(wanted / maze.n)) * maze.n;
  const { canvas, padUnits } = mazeTexture(maze, px);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    canvas,
    MAZE_BOX.x - padUnits, MAZE_BOX.y - padUnits,
    MAZE_BOX.size + 2 * padUnits, MAZE_BOX.size + 2 * padUnits,
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sprites et écrans
 * ──────────────────────────────────────────────────────────────────────────── */

/** Dessine une image centrée sur (cx, cy), `size` étant son plus grand côté. */
export function drawSprite(ctx, img, cx, cy, size) {
  const k = size / Math.max(img.width, img.height);
  const w = img.width * k, h = img.height * k;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/** Dessine un sprite au centre d'une cellule, à l'échelle de la grille. */
export function drawSpriteAtCell(ctx, img, n, i, j) {
  const { x, y } = cellCenter(n, i, j);
  drawSprite(ctx, img, x, y, cellSize(n) * SPRITE_SCALE);
}

/**
 * Dessine un écran plein cadre. Les visuels 960×720 tombent pile sur la scène ;
 * ceux d'un autre format sont contenus et centrés plutôt que rognés.
 */
export function drawBackdrop(ctx, img) {
  const k = Math.min(STAGE_W / img.width, STAGE_H / img.height);
  const w = img.width * k, h = img.height * k;
  ctx.drawImage(img, (STAGE_W - w) / 2, (STAGE_H - h) / 2, w, h);
}

/** Texte en unités de scène. */
export function drawText(ctx, text, x, y, opts = {}) {
  const {
    size = 12, color = '#ffffff', align = 'center', weight = '600',
    font = 'ui-sans-serif, system-ui, sans-serif', shadow = false,
  } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(text, x + size * 0.06, y + size * 0.06);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Bandeau translucide, pour poser du texte lisible sur une image. */
export function drawBanner(ctx, y, height, alpha = 0.62) {
  ctx.save();
  ctx.fillStyle = `rgba(8, 6, 5, ${alpha})`;
  ctx.fillRect(0, y, STAGE_W, height);
  ctx.restore();
}
