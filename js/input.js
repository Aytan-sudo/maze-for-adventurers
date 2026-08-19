/**
 * Entrées clavier.
 *
 * `W` reste la touche « marcher lentement » du jeu d'origine — c'est ce
 * qu'affiche l'écran de règles. Cela interdit WASD pour se déplacer ; on
 * propose donc ZQSD, qui laisse `W` libre et convient aux claviers AZERTY.
 *
 * On lit `event.key` et non `event.code` : c'est le caractère produit, donc la
 * touche réellement marquée « W » quelle que soit la disposition du clavier.
 */

import { NORTH, EAST, SOUTH, WEST } from './maze.js';

const MOVEMENT = {
  ArrowUp: NORTH, ArrowRight: EAST, ArrowDown: SOUTH, ArrowLeft: WEST,
  z: NORTH, d: EAST, s: SOUTH, q: WEST,
};

export class Input {
  constructor() {
    this.held = new Set();
    /** Consommé une fois puis remis à zéro : sert aux écrans, pas au jeu. */
    this.pressed = new Set();
    this.anyInteraction = false;

    /**
     * Commandes tactiles. `Ui` y écrit, le jeu les lit au même titre que le
     * clavier : rien en aval n'a besoin de savoir d'où vient l'intention.
     */
    this.virtual = { direction: null, slow: false };

    addEventListener('keydown', e => {
      if (e.repeat) return;
      const key = normalise(e.key);
      this.held.add(key);
      this.pressed.add(key);
      this.anyInteraction = true;
      // Les flèches et l'espace font défiler la page si on les laisse passer.
      if (key in MOVEMENT || key === ' ') e.preventDefault();
    });

    addEventListener('keyup', e => {
      this.held.delete(normalise(e.key));
    });

    // Une fenêtre qui perd le focus ne renvoie jamais le keyup : sans cela, le
    // héros continuerait tout seul au retour sur l'onglet.
    addEventListener('blur', () => this.held.clear());
  }

  /** Direction demandée, ou null. La dernière touche enfoncée l'emporte. */
  get direction() {
    let found = null;
    for (const key of this.held) {
      if (key in MOVEMENT) found = MOVEMENT[key];
    }
    // Le clavier prime : sur une tablette avec clavier, il ne faut pas qu'une
    // bascule tactile oubliée contrarie une touche réellement enfoncée.
    return found ?? this.virtual.direction;
  }

  get slowWalk() {
    return this.held.has('w') || this.held.has('shift') || this.virtual.slow;
  }

  /** Vrai une seule fois par appui. */
  consume(key) {
    const had = this.pressed.has(key);
    this.pressed.delete(key);
    return had;
  }

  get confirm() {
    // `||` court-circuite : on vide les deux touches avant de conclure, sinon
    // un « entrée » resté en attente déclencherait la transition suivante.
    const space = this.consume(' ');
    const enter = this.consume('enter');
    return space || enter || this.consumeVirtualConfirm();
  }

  /** Validation venue d'un bouton tactile. */
  pressVirtualConfirm() {
    this.virtualConfirm = true;
    this.anyInteraction = true;
  }

  consumeVirtualConfirm() {
    const had = this.virtualConfirm === true;
    this.virtualConfirm = false;
    return had;
  }

  endFrame() {
    this.pressed.clear();
  }
}

function normalise(key) {
  return key.length === 1 ? key.toLowerCase() : key === 'Shift' ? 'shift' : key === 'Enter' ? 'enter' : key;
}
