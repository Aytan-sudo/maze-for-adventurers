/**
 * Générateur pseudo-aléatoire semé.
 *
 * `Math.random()` ne convient pas : une même graine doit toujours produire le
 * même donjon, pour qu'une partie intéressante se partage par simple lien.
 * mulberry32 tient en quelques lignes, a une période de 2³² et une répartition
 * largement suffisante pour placer des murs et des minotaures.
 */

/** xmur3 — transforme une chaîne quelconque en graine 32 bits bien mélangée. */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class Rng {
  /** @param {string|number} seed */
  constructor(seed) {
    this.seed = seed;
    this.state = (typeof seed === 'number' ? seed : hashSeed(String(seed))) >>> 0;
  }

  /** Flottant dans [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entier dans [min, max], bornes comprises — comme le `random` de Scratch. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }

  /** Mélange en place (Fisher-Yates). */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
