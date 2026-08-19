/**
 * Surcouche HTML : panneaux, barre d'outils et commandes tactiles.
 *
 * Tout ce qui est texte, bouton ou formulaire vit en HTML plutôt que dessiné
 * sur le canevas : la navigation au clavier, le focus, la lecture d'écran et la
 * sélection fonctionnent alors sans une ligne de code.
 *
 * `Ui` ne change jamais d'écran elle-même — elle empile des commandes que
 * `main` transmet au jeu, qui reste seul maître de ses transitions.
 */

import {
  SIZES, DIFFICULTIES, ALGORITHMS, DEFAULTS,
  randomSeed, randomConfig, levelSize, levelMinotaurs, writeUrl,
} from './config.js';
import { MENU, SETUP, RULES, PLAY, PAUSE, DEAD, VICTORY, CREDITS } from './screens.js';
import { NORTH, EAST, SOUTH, WEST } from './maze.js';

const GROUPS = {
  taille: { options: SIZES, label: o => `${o.label}<small>${o.hint}</small>` },
  difficulte: { options: DIFFICULTIES, label: o => `${o.label}<small>${o.levels} niveaux</small>` },
  trace: { options: ALGORITHMS, label: o => o.label },
};

/** Place minimale, en pixels CSS, pour poser les commandes hors du labyrinthe. */
const TOUCH_BAND = 108;
const TOUCH_COLUMN = 96;

export class Ui {
  constructor(stage, input) {
    this.stage = stage;
    this.input = input;
    /** File lue et vidée par `main` à chaque image. */
    this.commands = [];

    this.overlay = document.getElementById('overlay');
    this.panels = {
      menu: document.getElementById('menu-panel'),
      setup: document.getElementById('setup-panel'),
      rules: document.getElementById('rules-panel'),
      pause: document.getElementById('pause-panel'),
      end: document.getElementById('end-panel'),
    };
    this.touch = document.getElementById('touch');
    this.seedInput = document.getElementById('seed-input');
    this.planText = document.getElementById('setup-plan');

    this.choice = { ...DEFAULTS };
    this.buildChoices();
    this.seedInput.value = randomSeed();

    this.hasTouch = matchMedia('(pointer: coarse)').matches
      || new URLSearchParams(location.search).has('tactile');
    /** 'bande' | 'colonnes' | 'surimpression' — décidé par `layoutTouch`. */
    this.touchLayout = 'bande';
    addEventListener('touchstart', () => { this.hasTouch = true; }, { once: true, passive: true });

    this.wireActions();
    this.wireTouch();
    this.refresh();
  }

  /* ── Formulaire de composition ─────────────────────────────────────── */

  buildChoices() {
    for (const [group, { options, label }] of Object.entries(GROUPS)) {
      const host = this.panels.setup.querySelector(`[data-group="${group}"]`);
      for (const [key, option] of Object.entries(options)) {
        const el = document.createElement('label');
        el.innerHTML =
          `<input type="radio" name="${group}" value="${key}"${key === this.choice[group] ? ' checked' : ''}>` +
          `<span>${label(option)}</span>`;
        el.querySelector('input').addEventListener('change', () => {
          this.choice[group] = key;
          this.refresh();
        });
        host.appendChild(el);
      }
    }
    document.getElementById('seed-reroll').addEventListener('click', () => {
      this.seedInput.value = randomSeed();
      this.refresh();
    });
    this.seedInput.addEventListener('input', () => this.refresh());
    this.panels.setup.addEventListener('submit', e => {
      e.preventDefault();
      const seed = this.seedInput.value.trim() || randomSeed();
      this.seedInput.value = seed;
      this.commands.push({ type: 'jouer', config: randomConfig({ ...this.choice, seed }) });
    });
  }

  /** Met à jour les explications et l'aperçu du donjon demandé. */
  refresh() {
    for (const group of ['difficulte', 'trace']) {
      const hint = this.panels.setup.querySelector(`[data-hint="${group}"]`);
      if (hint) hint.textContent = GROUPS[group].options[this.choice[group]].hint;
    }
    const size = SIZES[this.choice.taille];
    const mode = DIFFICULTIES[this.choice.difficulte];
    const sizes = [];
    let total = 0;
    for (let k = 0; k < mode.levels; k++) {
      const n = levelSize(size.n, k, mode.levels);
      total += levelMinotaurs(n, k, mode.levels, mode.minotaurFactor);
      sizes.push(`${n}×${n}`);
    }
    this.planText.textContent =
      `${mode.levels} niveaux : ${sizes.join(' → ')}. ` +
      (total === 0 ? 'Aucun minotaure.' : `${total} minotaures en tout.`);
  }

  adopt(options) {
    if (options.seed) this.seedInput.value = options.seed;
    for (const group of Object.keys(GROUPS)) {
      if (!options[group]) continue;
      this.choice[group] = options[group];
      const input = this.panels.setup.querySelector(`input[name="${group}"][value="${options[group]}"]`);
      if (input) input.checked = true;
    }
    this.refresh();
  }

  /* ── Boutons ───────────────────────────────────────────────────────── */

  wireActions() {
    const handle = e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'pleinecran') return toggleFullscreen();
      if (action === 'commencer') return this.input.pressVirtualConfirm();
      this.commands.push({ type: action });
    };
    this.overlay.addEventListener('click', handle);
    document.getElementById('bar').addEventListener('click', handle);
  }

  /* ── Commandes tactiles ────────────────────────────────────────────── */

  wireTouch() {
    const DIRS = [NORTH, EAST, SOUTH, WEST];
    // Un doigt peut glisser d'un bouton à l'autre : on retient la direction par
    // pointeur, et la dernière posée l'emporte — comme au clavier.
    const active = new Map();
    const apply = () => {
      const dirs = [...active.values()];
      this.input.virtual.direction = dirs.length ? dirs[dirs.length - 1] : null;
      for (const btn of this.touch.querySelectorAll('.dpad-btn')) {
        btn.classList.toggle('is-down', dirs.includes(DIRS[Number(btn.dataset.dir)]));
      }
    };

    for (const btn of this.touch.querySelectorAll('.dpad-btn')) {
      const dir = DIRS[Number(btn.dataset.dir)];
      btn.addEventListener('pointerdown', e => {
        // La capture garantit de recevoir le relâchement même si le doigt a
        // quitté le bouton entre-temps — sans quoi le héros part tout seul.
        btn.setPointerCapture(e.pointerId);
        active.set(e.pointerId, dir);
        this.input.anyInteraction = true;
        apply();
        e.preventDefault();
      });
      for (const type of ['pointerup', 'pointercancel']) {
        btn.addEventListener(type, e => {
          active.delete(e.pointerId);
          apply();
        });
      }
    }

    const slow = document.getElementById('slow-toggle');
    slow.addEventListener('click', () => {
      // Une bascule, pas un maintien : tenir direction et `W` à la fois est
      // intenable au pouce.
      this.input.virtual.slow = !this.input.virtual.slow;
      slow.setAttribute('aria-pressed', String(this.input.virtual.slow));
      this.input.anyInteraction = true;
    });
  }

  /* ── Affichage ─────────────────────────────────────────────────────── */

  /** Vrai si les commandes tactiles doivent occuper la bande sous la scène. */
  touchActive(screen) {
    return this.hasTouch && screen === PLAY;
  }

  /** @param {string} screen écran courant @param {object} state {muted} */
  sync(screen, state) {
    const shown = {
      menu: screen === MENU,
      setup: screen === SETUP,
      rules: screen === RULES,
      pause: screen === PAUSE,
      end: screen === DEAD || screen === VICTORY || screen === CREDITS,
    };
    if (shown.rules) this.describeControls();
    for (const [name, panel] of Object.entries(this.panels)) panel.hidden = !shown[name];
    this.overlay.hidden = !Object.values(shown).some(Boolean);
    if (!this.overlay.hidden) this.place(this.overlay, this.stage.cssRect);

    this.touch.hidden = !(this.hasTouch && screen === PLAY);
    if (!this.touch.hidden) this.layoutTouch();

    const pause = document.querySelector('[data-action="pause"]');
    pause.hidden = screen !== PLAY && screen !== PAUSE;
    const sound = document.querySelector('[data-action="son"]');
    sound.textContent = state.muted ? 'Son coupé' : 'Son';
    sound.setAttribute('aria-pressed', String(state.muted));
  }

  /** L'écran de règles d'origine parle de flèches : au tactile, c'est faux. */
  describeControls() {
    const move = this.panels.rules.querySelector('[data-rules="move"]');
    const slow = this.panels.rules.querySelector('[data-rules="slow"]');
    move.textContent = this.hasTouch ? 'La croix directionnelle' : 'Flèches ou ZQSD';
    slow.textContent = this.hasTouch ? 'Le bouton W' : 'W';
  }

  place(el, { left, top, width, height }) {
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }

  /**
   * Le labyrinthe doit rester lisible en entier : les commandes se posent donc
   * dans la place que la scène 4:3 laisse autour d'elle, et jamais par-dessus.
   *
   * - **portrait** : large bande sous le jeu, commandes collées en bas ;
   * - **paysage** : bandes latérales, D-pad à gauche et bascule à droite ;
   * - à défaut seulement, surimpression au bas du cadre.
   */
  layoutTouch() {
    const rect = this.stage.cssRect;
    const app = document.getElementById('app').getBoundingClientRect();
    const below = app.height - (rect.top + rect.height);
    const side = Math.min(rect.left, app.width - (rect.left + rect.width));

    let box, pad;
    if (below >= TOUCH_BAND) {
      this.touchLayout = 'bande';
      // Plafonnée et collée au bas : sur un grand téléphone, occuper toute la
      // hauteur restante mettrait les boutons au milieu du vide.
      const height = Math.min(below, 230);
      box = { left: rect.left, top: app.height - height, width: rect.width, height };
      pad = Math.min(132, height - 18, rect.width * 0.3);
    } else if (side >= TOUCH_COLUMN) {
      this.touchLayout = 'colonnes';
      box = { left: 0, top: rect.top, width: app.width, height: rect.height };
      pad = Math.min(132, side - 14, rect.height * 0.42);
    } else {
      this.touchLayout = 'surimpression';
      const height = Math.min(TOUCH_BAND + 20, rect.height * 0.34);
      box = { left: rect.left, top: rect.top + rect.height - height, width: rect.width, height };
      pad = Math.min(110, height - 14, rect.width * 0.26);
    }

    this.touch.dataset.layout = this.touchLayout;
    this.place(this.touch, box);
    this.touch.style.setProperty('--pad', `${Math.max(52, pad)}px`);
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Reflète la partie en cours dans la barre d'adresse, pour la partager. */
export function shareUrl(meta) {
  if (!meta) return;
  history.replaceState(null, '', writeUrl(meta));
}
