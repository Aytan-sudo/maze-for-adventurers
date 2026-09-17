/**
 * Machine à états des écrans, et déroulement d'une partie.
 *
 * L'enchaînement reprend celui du Scratch d'origine :
 *
 *   menu ─espace─▶ règles ─espace─▶ niveaux ─escalier─▶ … ─coffre─▶ victoire
 *                                      │                              │
 *                                   crédits ◀── mort ◀────────────────┘
 *
 * Seule addition : on peut rejouer depuis les crédits. L'original y restait
 * bloqué, puisqu'on relançait le projet en cliquant le drapeau vert.
 */

import { Level, SPEEDS } from './level.js';
import { Rng } from './rng.js';
import { noterPasseport } from './passeport.js';
import {
  STAGE_W, STAGE_H, drawMaze, drawMazeWalls, drawSprite, drawBackdrop, drawText,
  drawBanner, cellCenter, cellSize, applyCamera, zoomFor, SPRITE_SCALE, COLORS,
} from './render.js';

export const MENU = 'menu', SETUP = 'setup', RULES = 'rules', PLAY = 'play',
  PAUSE = 'pause', DEAD = 'dead', VICTORY = 'victory', CREDITS = 'credits';

/** Durée des écrans de fin avant les crédits, comme dans l'original. */
const OUTCOME_MS = 4000;

export class Game {
  constructor(assets, audio, config) {
    this.assets = assets;
    this.audio = audio;
    this.config = config;
    this.screen = MENU;
    this.timer = 0;
    this.levelIndex = 0;
    this.level = null;
    this.traveled = 0;
    this.seed = null;
    /** Faux quand les commandes tactiles rendent le rappel clavier inutile. */
    this.showKeyHints = true;
    /** Faux en scène carrée : il n'y a plus de marge où poser le HUD. */
    this.showHud = true;
    /** Vue d'ensemble : tout le labyrinthe, au prix de cellules minuscules. */
    this.overview = false;
    /** Coup d'œil : `X` enfoncée, sans toucher à la bascule ci-dessus. */
    this.peek = false;
  }

  /* ── Transitions ───────────────────────────────────────────────────── */

  goto(screen) {
    // Quitter le labyrinthe dépose les mètres encore en mémoire : mourir juste
    // avant le seuil ne doit pas perdre les derniers pas.
    if (this.screen === PLAY && screen !== PLAY) noterPasseport({ deposer: true });
    this.screen = screen;
    this.timer = 0;

    switch (screen) {
      case MENU:
        this.audio.playMusic('menu');
        break;
      case SETUP:
      case RULES:
      case PAUSE:
        break;
      case PLAY:
        this.audio.playMusic('adventure');
        break;
      case DEAD:
        this.audio.stopAll();
        this.audio.playOnce('dead');
        break;
      case VICTORY:
        this.audio.stopAll();
        this.audio.playMusic('credits');
        break;
      case CREDITS:
        // Après une mort la piste des crédits n'a pas encore démarré ; après une
        // victoire elle tourne déjà et `playMusic` la laisse alors continuer.
        this.audio.playMusic('credits', { volume: 0.75 });
        break;
    }
  }

  /** Remplace la composition de la partie (campagne ou donjon engendré). */
  setConfig(config) {
    this.config = config;
  }

  /** Rejoue le donjon en cours à l'identique. */
  restart() {
    this.start(this.seed);
  }

  /** Nouvelle partie. Une graine donnée rejoue exactement le même donjon. */
  start(seed = String(Math.floor(Math.random() * 1e9))) {
    this.seed = seed;
    this.levelIndex = 0;
    this.traveled = 0;
    this.loadLevel(0);
    this.goto(PLAY);
  }

  loadLevel(index) {
    this.levelIndex = index;
    // Une graine dérivée par niveau : changer de niveau ne dépend pas de ce que
    // le générateur a consommé aux précédents.
    const rng = new Rng(`${this.seed}#${index}`);
    this.level = new Level(this.config.levels[index], rng);
  }

  /* ── Boucle ────────────────────────────────────────────────────────── */

  update(dt, input) {
    this.timer += dt;
    // Relu à chaque image : relâcher la touche doit refermer la vue tout seul.
    this.peek = input.peekView;

    switch (this.screen) {
      case MENU:
        if (input.confirm) this.goto(RULES);
        break;

      case SETUP:
        // Piloté par la surcouche HTML ; l'échappement revient au menu.
        if (input.consume('escape')) this.goto(MENU);
        break;

      case RULES:
        if (input.confirm) this.start();
        break;

      case PAUSE:
        if (input.consume('escape') || input.consume('p')) this.goto(PLAY);
        break;

      case PLAY: {
        if (input.consume('escape') || input.consume('p')) {
          this.goto(PAUSE);
          break;
        }
        const avant = this.level.hero.traveled;
        const outcome = this.level.update(dt, {
          direction: input.direction,
          slowWalk: input.slowWalk,
        }, this.config.survivalOdds);
        // Les cases réellement franchies nourrissent le tampon à l'effort.
        noterPasseport({ metres: this.level.hero.traveled - avant });

        if (outcome === 'stairs') {
          this.traveled += this.level.hero.traveled;
          this.loadLevel(this.levelIndex + 1);
        } else if (outcome === 'treasure') {
          this.traveled += this.level.hero.traveled;
          // Le trésor : la vraie victoire du jeu, tampon immédiat.
          noterPasseport({ reussite: true });
          this.goto(VICTORY);
        } else if (outcome === 'dead') {
          this.traveled += this.level.hero.traveled;
          this.goto(DEAD);
        }
        break;
      }

      case DEAD:
      case VICTORY:
        // L'attente est passable : rester quatre secondes devant un écran fixe
        // qu'on a déjà vu n'apporte rien.
        if (this.timer >= OUTCOME_MS || input.confirm) this.goto(CREDITS);
        break;

      case CREDITS:
        if (input.confirm) this.goto(MENU);
        break;
    }
  }

  /** Distance parcourue, niveaux terminés compris. */
  get totalTraveled() {
    return this.traveled + (this.screen === PLAY && this.level ? this.level.hero.traveled : 0);
  }

  /* ── Rendu ─────────────────────────────────────────────────────────── */

  draw(ctx, pixelsPerUnit) {
    const img = id => this.assets.img(id);

    switch (this.screen) {
      case MENU:
        drawBackdrop(ctx, img('start_menu'));
        break;

      case SETUP:
        drawBackdrop(ctx, img('start_menu'));
        // Voile sombre : le panneau de configuration doit rester lisible
        // par-dessus un fond aussi chargé que ce labyrinthe dessiné.
        ctx.fillStyle = 'rgba(10, 8, 7, 0.82)';
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        break;

      case RULES:
        drawBackdrop(ctx, img('rules'));
        drawBanner(ctx, STAGE_H - 30, 30);
        drawText(ctx, 'Flèches ou ZQSD pour avancer · W pour marcher lentement',
          STAGE_W / 2, STAGE_H - 17, { size: 11, color: '#ffd9a0' });
        drawText(ctx, 'Espace pour entrer dans le labyrinthe',
          STAGE_W / 2, STAGE_H - 6, { size: 9, color: '#9fb6d4' });
        break;

      case PLAY:
        this.drawLevel(ctx, pixelsPerUnit);
        break;

      case PAUSE:
        // Le niveau reste visible sous le voile : on se souvient d'où l'on est.
        this.drawLevel(ctx, pixelsPerUnit);
        ctx.fillStyle = 'rgba(10, 8, 7, 0.78)';
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        break;

      case DEAD:
        drawBackdrop(ctx, img('dead'));
        break;

      case VICTORY:
        ctx.fillStyle = COLORS.floor;
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        drawBackdrop(ctx, img('victory'));
        drawBanner(ctx, STAGE_H - 34, 34);
        drawText(ctx, 'Victoire ! Vous avez trouvé le trésor',
          STAGE_W / 2, STAGE_H - 20, { size: 13, color: '#ffd45e' });
        drawText(ctx, `Vous avez parcouru ${this.totalTraveled} mètres dans le donjon`,
          STAGE_W / 2, STAGE_H - 7, { size: 10, color: '#e8e2d8' });
        break;

      case CREDITS:
        drawBackdrop(ctx, img('credits'));
        drawBanner(ctx, STAGE_H - 26, 26);
        drawText(ctx, 'Espace pour rejouer', STAGE_W / 2, STAGE_H - 9,
          { size: 12, color: '#ffd9a0' });
        break;
    }
  }

  /** Vrai si la grille est trop grande pour être lue d'un coup d'œil. */
  get zoomable() {
    return this.level ? zoomFor(this.level.maze.n) > 1 : false;
  }

  /** Vue large affichée, que ce soit la bascule ou le coup d'œil. */
  get wideView() {
    return this.overview || this.peek;
  }

  drawLevel(ctx, pixelsPerUnit) {
    const level = this.level;
    const n = level.maze.n;
    const size = cellSize(n) * SPRITE_SCALE;
    const zoom = this.wideView ? 1 : zoomFor(n);

    ctx.save();
    const range = applyCamera(ctx, level.maze, level.hero.fi, level.hero.fj, zoom);

    // Sans zoom, la texture mémorisée évite de retracer des milliers de
    // segments ; avec, seule une centaine est visible et le tracé direct reste
    // net quel que soit le grossissement.
    if (zoom > 1) drawMazeWalls(ctx, level.maze, range);
    else drawMaze(ctx, level.maze, pixelsPerUnit);

    const exit = cellCenter(n, level.exit.i, level.exit.j);
    drawSprite(ctx, this.assets.img(level.exitKind === 'treasure' ? 'treasure' : 'stairs'),
      exit.x, exit.y, size);

    for (const m of level.minotaurs) {
      const p = cellCenter(n, m.fi, m.fj);
      drawSprite(ctx, this.assets.img('minotaur'), p.x, p.y, size);
    }

    const hero = cellCenter(n, level.hero.fi, level.hero.fj);
    drawSprite(ctx, this.assets.img('hero'), hero.x, hero.y, size);
    ctx.restore();

    if (this.showHud) this.drawHud(ctx);
  }

  /**
   * Le carré de jeu laisse 70 unités de marge de chaque côté mais seulement 10
   * en haut et en bas : le HUD tient donc dans les marges latérales, où il ne
   * recouvre jamais les murs.
   */
  drawHud(ctx) {
    const label = { size: 8, color: '#7d766e', weight: '600' };
    const value = { size: 15, color: '#e8e2d8', weight: '700' };

    drawText(ctx, 'NIVEAU', 34, 40, { ...label, align: 'center' });
    drawText(ctx, `${this.levelIndex + 1} / ${this.config.levels.length}`, 34, 58,
      { ...value, align: 'center' });

    drawText(ctx, 'DISTANCE', 445, 40, { ...label, align: 'center' });
    drawText(ctx, `${this.totalTraveled} m`, 445, 58, { ...value, align: 'center' });

    if (!this.showKeyHints) return;
    const slow = this.level.hero.stepMs > SPEEDS.heroNormal;
    drawText(ctx, 'W', 34, 316, {
      size: 15, weight: '700', align: 'center',
      color: slow ? '#8fe388' : '#4d4842',
    });
    drawText(ctx, slow ? 'marche lente' : 'marcher', 34, 330,
      { size: 8, align: 'center', color: slow ? '#8fe388' : '#7d766e' });
    if (!slow) drawText(ctx, 'lentement', 34, 340, { size: 8, align: 'center', color: '#7d766e' });

    // Le rappel de `V` ne sert que sur les grilles qui débordent de l'écran :
    // ailleurs la vue d'ensemble est déjà ce qu'on regarde.
    if (!this.zoomable) return;
    const wide = this.wideView;
    drawText(ctx, 'V', 445, 316, {
      size: 15, weight: '700', align: 'center',
      color: wide ? '#8fe388' : '#4d4842',
    });
    const tint = wide ? '#8fe388' : '#7d766e';
    drawText(ctx, 'vue', 445, 330, { size: 8, align: 'center', color: tint });
    drawText(ctx, "d'ensemble", 445, 340, { size: 8, align: 'center', color: tint });
  }
}
