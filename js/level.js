/**
 * Un niveau en cours : le labyrinthe, le héros, les minotaures, la sortie.
 *
 * Cette couche porte les règles du jeu ; elle ne dessine rien et ne lit aucune
 * touche. Elle reçoit `dt` et l'intention du joueur, et renvoie ce qui vient de
 * se produire (`'stairs'`, `'treasure'`, `'dead'` ou `null`).
 */

import { Hero, Minotaur, distanceBetween } from './entities.js';
import { pickFarCell } from './maze.js';

/**
 * Cadences, en millisecondes par cellule. Courir est plus rapide qu'un
 * minotaure, marcher lentement ne l'est pas : c'est là tout l'arbitrage du jeu,
 * puisque seule la marche lente protège d'une rencontre.
 */
export const SPEEDS = {
  heroNormal: 130,
  heroSlow: 320,
  minotaur: 220,
};

/** Contact déclaré en deçà de cette fraction de cellule. */
const CONTACT_DISTANCE = 0.6;

export class Level {
  /**
   * @param {object} spec {maze, start:[i,j], minotaurs:number, exit:'stairs'|'treasure'}
   * @param {Rng} rng
   */
  constructor(spec, rng) {
    this.maze = spec.maze;
    this.rng = rng;
    this.exitKind = spec.exit;

    const [si, sj] = spec.start;
    this.hero = new Hero(si, sj, { normal: SPEEDS.heroNormal, slow: SPEEDS.heroSlow });

    const far = pickFarCell(this.maze, si, sj, rng);
    this.exit = { i: far.i, j: far.j };
    this.exitDistance = far.distance;

    this.minotaurs = this.spawnMinotaurs(spec.minotaurs, si, sj);
    this.outcome = null;
  }

  /**
   * Les minotaures n'apparaissent pas trop près du héros : on ne peut rien
   * contre une rencontre survenue avant d'avoir touché une touche.
   */
  spawnMinotaurs(count, si, sj) {
    const n = this.maze.n;
    const minDistance = Math.max(3, Math.floor(n / 4));
    const cells = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (Math.abs(i - si) + Math.abs(j - sj) >= minDistance) cells.push([i, j]);
      }
    }
    this.rng.shuffle(cells);
    return cells.slice(0, count).map(([i, j]) => new Minotaur(i, j, SPEEDS.minotaur));
  }

  /**
   * @param {number} dt millisecondes
   * @param {object} intent {direction, slowWalk}
   * @param {number} survivalOdds chances sur 50 de survivre en marchant lentement
   * @returns {'stairs'|'treasure'|'dead'|null}
   */
  update(dt, intent, survivalOdds) {
    if (this.outcome) return null;

    this.hero.update(this.maze, dt, intent.direction, intent.slowWalk);
    for (const m of this.minotaurs) m.update(this.maze, dt, this.rng);

    const encounter = this.resolveEncounters(intent.slowWalk, survivalOdds);
    if (encounter) return (this.outcome = 'dead');

    if (!this.hero.moving && this.hero.i === this.exit.i && this.hero.j === this.exit.j) {
      return (this.outcome = this.exitKind);
    }
    return null;
  }

  /**
   * Le jet de survie n'a lieu qu'à l'instant du contact, pas à chaque image.
   * L'original relançait le dé environ vingt fois par seconde, si bien que même
   * en marchant lentement on mourait en frôlant un minotaure une seconde.
   * @returns {boolean} vrai si le héros meurt
   */
  resolveEncounters(slowWalk, survivalOdds) {
    let fatal = false;
    for (const m of this.minotaurs) {
      const touching = distanceBetween(this.hero, m) < CONTACT_DISTANCE;
      if (touching && !m.contact) {
        m.contact = true;
        const roll = this.rng.int(1, 50);
        if (!(slowWalk && roll <= survivalOdds)) fatal = true;
      } else if (!touching) {
        m.contact = false;
      }
    }
    return fatal;
  }
}

/** Répartition des minotaures dans le Scratch d'origine, niveau par niveau. */
export const CAMPAIGN_MINOTAURS = [0, 2, 4, 16];

/** Construit la campagne d'origine à partir des labyrinthes extraits. */
export function campaignConfig(campaign) {
  return {
    name: 'Campagne originale',
    survivalOdds: 49,
    levels: campaign.map((level, k) => ({
      maze: level.maze,
      start: level.start,
      minotaurs: CAMPAIGN_MINOTAURS[k] ?? 0,
      exit: k === campaign.length - 1 ? 'treasure' : 'stairs',
    })),
  };
}
