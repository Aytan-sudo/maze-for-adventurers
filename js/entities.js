/**
 * Entités mobiles.
 *
 * Tout se joue en coordonnées de cellule, jamais en pixels : les entités
 * ignorent la taille du labyrinthe à l'écran. Elles exposent une position
 * fractionnaire (`fi`, `fj`) que le rendu convertit en unités de scène.
 *
 * Le déplacement est discret mais l'affichage continu : on glisse d'une cellule
 * à la suivante en `stepMs`. Une fois arrivé, si une direction est toujours
 * demandée et praticable, le pas suivant enchaîne sans temps mort.
 */

import { DELTA, OPPOSITE, DIRECTIONS } from './maze.js';

export class Walker {
  constructor(i, j, stepMs) {
    this.i = i;
    this.j = j;
    this.fromI = i;
    this.fromJ = j;
    this.stepMs = stepMs;
    this.dir = null;
    /** Avancement du pas en cours, de 0 à 1. À 1, l'entité est immobile. */
    this.t = 1;
  }

  get moving() { return this.t < 1; }

  get fi() { return this.fromI + (this.i - this.fromI) * this.t; }
  get fj() { return this.fromJ + (this.j - this.fromJ) * this.t; }

  /** Engage un pas si le mur le permet. @returns {boolean} pas engagé */
  startStep(maze, dir) {
    if (this.moving || dir === null || maze.hasWall(this.i, this.j, dir)) return false;
    const [di, dj] = DELTA[dir];
    this.fromI = this.i;
    this.fromJ = this.j;
    this.i += di;
    this.j += dj;
    this.dir = dir;
    this.t = 0;
    return true;
  }

  /** @returns {boolean} vrai à l'image exacte où un pas s'achève */
  advance(dt) {
    if (!this.moving) return false;
    this.t = Math.min(1, this.t + dt / this.stepMs);
    if (this.t < 1) return false;
    this.fromI = this.i;
    this.fromJ = this.j;
    return true;
  }
}

export class Hero extends Walker {
  constructor(i, j, speeds) {
    super(i, j, speeds.normal);
    this.speeds = speeds;
    /** Cases réellement franchies — le compteur « Traveled » de l'original. */
    this.traveled = 0;
  }

  /**
   * @param {number} dt millisecondes écoulées
   * @param {number|null} dir direction demandée
   * @param {boolean} slow touche « marcher lentement » enfoncée
   */
  update(maze, dt, dir, slow) {
    // La vitesse change même en cours de pas : relâcher `W` accélère aussitôt.
    this.stepMs = slow ? this.speeds.slow : this.speeds.normal;
    if (this.advance(dt)) this.traveled++;
    this.startStep(maze, dir);
  }
}

export class Minotaur extends Walker {
  constructor(i, j, stepMs) {
    super(i, j, stepMs);
    /** Réarmé quand le héros s'éloigne : un contact ne se joue qu'une fois. */
    this.contact = false;
  }

  /**
   * Marche au hasard. L'original retirait une direction à chaque pas sans
   * mémoire, ce qui produisait surtout du sur-place ; on écarte le demi-tour
   * immédiat, sauf en impasse où il est la seule issue. Le minotaure reste
   * aussi imprévisible, mais il patrouille au lieu de trembler.
   */
  update(maze, dt, rng) {
    this.advance(dt);
    if (this.moving) return;

    const back = this.dir === null ? null : OPPOSITE[this.dir];
    const options = DIRECTIONS.filter(d => !maze.hasWall(this.i, this.j, d));
    const forward = options.filter(d => d !== back);
    const choice = forward.length ? rng.pick(forward) : options.length ? options[0] : null;
    this.startStep(maze, choice);
  }
}

/** Distance entre deux entités, en cellules. */
export function distanceBetween(a, b) {
  return Math.hypot(a.fi - b.fi, a.fj - b.fj);
}
