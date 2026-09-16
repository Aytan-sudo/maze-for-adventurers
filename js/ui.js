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

/**
 * Taille des commandes tactiles, en pixels CSS. Elle n'est pas fixée : elle
 * découle de la place laissée par la scène, bornée aux deux bouts.
 *
 * - en dessous de `TOUCH_MIN`, la cible devient trop petite pour un pouce, et
 *   la disposition suivante est essayée ;
 * - au-delà de `TOUCH_MAX`, le bouton encombre sans être plus facile à viser.
 */
const TOUCH_MIN = 96;
const TOUCH_MAX = 260;

/** Écart entre les deux commandes — le `gap` du conteneur, en pixels. */
const TOUCH_GAP = 16;

/** Hauteur de la surimpression, dernier recours posé sur le labyrinthe. */
const TOUCH_OVERLAY = 128;

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

    const fullscreen = document.querySelector('[data-action="pleinecran"]');
    fullscreen.hidden = !FULLSCREEN_SUPPORTED;
    addEventListener('fullscreenchange', () => {
      fullscreen.textContent = document.fullscreenElement ? 'Quitter' : 'Plein écran';
    });

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
      if (action === 'installer') return;
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
        // On enregistre la direction *avant* de tenter la capture : celle-ci
        // n'est qu'un confort — recevoir le relâchement même si le doigt a
        // quitté le bouton — et elle lève sur certains pointeurs. La faire
        // passer en premier condamnait le D-pad entier à la moindre erreur.
        active.set(e.pointerId, dir);
        this.input.anyInteraction = true;
        apply();
        e.preventDefault();
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {
          // Sans capture, un doigt qui glisse hors du bouton ne renverra pas
          // son relâchement ; `pointerleave` prend alors le relais.
        }
      });
      btn.addEventListener('pointerleave', e => {
        if (btn.hasPointerCapture?.(e.pointerId)) return;
        active.delete(e.pointerId);
        apply();
      });
      for (const type of ['pointerup', 'pointercancel']) {
        btn.addEventListener(type, e => {
          // Le relâchement est différé de deux images : une tape sèche tient
          // dans une seule image, et la boucle de jeu ne verrait jamais la
          // direction. Deux images garantissent qu'un appui bref donne un pas.
          requestAnimationFrame(() => requestAnimationFrame(() => {
            active.delete(e.pointerId);
            apply();
          }));
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
    pause.textContent = screen === PAUSE ? 'Reprendre' : 'Pause';
    const sound = document.querySelector('[data-action="son"]');
    sound.textContent = state.muted ? 'Son coupé' : 'Son';
    sound.setAttribute('aria-pressed', String(state.muted));

    const view = document.querySelector('[data-action="vue"]');
    // Sur une petite grille tout tient déjà : le bouton n'aurait rien à faire.
    view.hidden = !(state.zoomable && (screen === PLAY || screen === PAUSE));
    view.textContent = state.overview ? 'Vue rapprochée' : 'Vue d\'ensemble';
    view.setAttribute('aria-pressed', String(state.overview));
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
   * Zone masquée par l'encoche ou la barre d'accueil, en pixels CSS. Relue à
   * chaque changement de taille : c'est là, et seulement là, qu'elle bouge.
   */
  safeInsets() {
    const key = `${innerWidth}x${innerHeight}`;
    if (this.insetKey !== key) {
      const s = getComputedStyle(document.getElementById('safe-probe'));
      this.insetKey = key;
      this.insets = {
        right: parseFloat(s.paddingRight) || 0,
        left: parseFloat(s.paddingLeft) || 0,
      };
    }
    return this.insets;
  }

  /**
   * Le labyrinthe doit rester lisible en entier : les commandes se posent donc
   * dans la place que la scène laisse autour d'elle, et jamais par-dessus.
   *
   * - **bande** : sous le jeu, commandes collées en bas — le cas du portrait ;
   * - **colonnes** : bandes latérales, D-pad à gauche et bascule à droite ;
   * - à défaut seulement, surimpression au bas du cadre.
   *
   * La taille des boutons n'est jamais choisie d'avance : chaque disposition
   * annonce ce qu'elle peut offrir, on retient la première qui reste visable au
   * pouce, et le bouton prend toute la place ainsi trouvée. Un iPad y gagne des
   * flèches deux fois plus grandes que sur un téléphone, sans réglage dédié.
   */
  layoutTouch() {
    const rect = this.stage.cssRect;
    const app = document.getElementById('app').getBoundingClientRect();
    const safe = this.safeInsets();

    // Place libre autour de la scène, une fois l'encoche déduite.
    const below = app.height - (rect.top + rect.height);
    const side = Math.min(rect.left - safe.left, app.width - (rect.left + rect.width) - safe.right);

    // Les deux commandes se partagent la largeur : chacune en a la moitié,
    // gouttières et écart déduits.
    //
    // La bande occupe toute la largeur de l'écran, pas seulement celle de la
    // scène : rien d'autre n'habite cette rangée. Les mesurer sur la scène
    // bridait les commandes dès que celle-ci devenait carrée — sur un iPhone SE,
    // 246 px de scène donnaient des flèches de 34 px là où l'écran en offrait 56.
    const gutter = Math.max(8, Math.min(32, app.width * 0.04));
    const halfWidth = (app.width - 2 * gutter - TOUCH_GAP) / 2;
    // La surimpression, elle, est posée SUR le labyrinthe : elle reste bornée
    // par la scène, sous peine de déborder sur les bandes noires.
    const halfScene = (rect.width - 2 * gutter - TOUCH_GAP) / 2;

    // Plafonnée et collée au bas : sur un grand écran, occuper toute la hauteur
    // restante mettrait les boutons au milieu du vide.
    const bandHeight = Math.min(below, TOUCH_MAX + 24);
    const bandPad = Math.min(bandHeight - 16, halfWidth);
    // Bornée par la hauteur de la scène : la commande est centrée dans sa
    // colonne, et doit y garder un peu d'air au-dessus et au-dessous.
    const columnPad = Math.min(side - 8, rect.height * 0.7);

    let box, pad, margins;
    if (bandPad >= TOUCH_MIN) {
      this.touchLayout = 'bande';
      box = { left: 0, top: app.height - bandHeight, width: app.width, height: bandHeight };
      // Collée aux bords de l'écran depuis qu'elle en prend toute la largeur,
      // la bande doit à son tour éviter l'encoche.
      margins = { left: Math.max(gutter, safe.left), right: Math.max(gutter, safe.right) };
      pad = bandPad;
    } else if (columnPad >= TOUCH_MIN) {
      this.touchLayout = 'colonnes';
      box = { left: 0, top: rect.top, width: app.width, height: rect.height };
      // Collées aux bords de l'écran, les colonnes sont ce qui risque le plus
      // de passer sous l'encoche : c'est ici que la sonde sert vraiment.
      margins = { left: Math.max(8, safe.left), right: Math.max(8, safe.right) };
      pad = columnPad;
    } else {
      this.touchLayout = 'surimpression';
      const height = Math.min(TOUCH_OVERLAY, rect.height * 0.34);
      box = { left: rect.left, top: rect.top + rect.height - height, width: rect.width, height };
      margins = { left: gutter, right: gutter };
      // Posée sur le labyrinthe, elle reste volontairement discrète.
      pad = Math.min(height - 10, halfScene, 180);
    }

    this.touch.dataset.layout = this.touchLayout;
    this.place(this.touch, box);
    this.touch.style.paddingLeft = `${Math.round(margins.left)}px`;
    this.touch.style.paddingRight = `${Math.round(margins.right)}px`;
    const size = Math.round(Math.min(TOUCH_MAX, Math.max(TOUCH_MIN, pad)));
    this.touch.style.setProperty('--pad', `${size}px`);
  }
}

/**
 * iOS ne propose l'API plein écran que sur les vidéos : le bouton y resterait
 * sans effet visible. On le masque plutôt que de laisser croire à une panne —
 * sur iPhone, c'est « Ajouter à l'écran d'accueil » qui enlève les barres, ce
 * que le manifeste et les balises `apple-mobile-web-app-*` prennent en charge.
 */
const FULLSCREEN_SUPPORTED = typeof document.documentElement.requestFullscreen === 'function'
  && (document.fullscreenEnabled ?? true);

function toggleFullscreen() {
  if (!FULLSCREEN_SUPPORTED) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

/** Reflète la partie en cours dans la barre d'adresse, pour la partager. */
export function shareUrl(meta) {
  if (!meta) return;
  history.replaceState(null, '', writeUrl(meta));
}
