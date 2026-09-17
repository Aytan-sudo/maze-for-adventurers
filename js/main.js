/**
 * Point d'entrée : chargement, boucle de jeu, redimensionnement.
 */

import { loadAssets } from './assets.js';
import { loadCampaign } from './maze.js';
import { Input } from './input.js';
import { AudioPlayer } from './audio.js';
import { Game, MENU, SETUP, RULES, PLAY, PAUSE } from './screens.js';
import { originalConfig, randomConfig, readUrl } from './config.js';
import { Ui, shareUrl } from './ui.js';
import { noterPasseport } from './passeport.js';
import * as render from './render.js';
import { Stage, COLORS, drawText, setViewport } from './render.js';

const stage = new Stage(document.getElementById('stage'));
const input = new Input();
const ui = new Ui(stage, input);

let game = null;
let campaignCfg = null;
let error = null;
let last = 0;

/**
 * Un onglet en arrière-plan suspend `requestAnimationFrame` : au retour, `dt`
 * vaudrait plusieurs secondes et le héros traverserait le labyrinthe d'un coup.
 */
const MAX_DT = 50;

/** Exécute ce que la surcouche a demandé. Elle ne décide jamais seule. */
function runCommand(cmd) {
  switch (cmd.type) {
    case 'campagne':
      game.setConfig(campaignCfg);
      shareUrl(campaignCfg.meta);
      game.goto(RULES);
      break;
    case 'jouer':
      game.setConfig(cmd.config);
      shareUrl(cmd.config.meta);
      // On sort d'un écran de composition : rappeler les règles ici serait une
      // étape de trop. La campagne, elle, garde le passage d'origine.
      game.start(cmd.config.meta.seed);
      break;
    case 'setup': game.goto(SETUP); break;
    case 'menu': game.goto(MENU); break;
    case 'reprendre': game.goto(PLAY); break;
    case 'recommencer': game.restart(); break;
    case 'son':
      game.audio.unlock();
      game.audio.toggleMute();
      break;
    case 'pause':
      game.goto(game.screen === PAUSE ? PLAY : PAUSE);
      break;
    case 'vue':
      game.overview = !game.overview;
      break;
    case 'rejouer':
      if (game.config.meta?.mode === 'campagne') game.start();
      else game.restart();
      break;
  }
}

function frame(now) {
  requestAnimationFrame(frame);

  const dt = last ? Math.min(MAX_DT, now - last) : 0;
  last = now;

  // Sur un écran étroit, la scène passe au carré le temps de la partie : le
  // labyrinthe cesse d'être bridé par la largeur des marges du format 4:3.
  //
  // Au tactile, elle y passe aussi en paysage. Le carré n'y agrandit pas le
  // labyrinthe — il reste bridé par la hauteur dans les deux formats — mais il
  // rend les marges latérales du 4:3, jusque-là occupées par le HUD, aux
  // commandes tactiles : sur iPad, le D-pad y double de taille. Le HUD passe
  // dans la barre du bas, exactement comme en portrait.
  const playing = game && (game.screen === PLAY || game.screen === PAUSE);
  const narrow = innerWidth / Math.max(1, innerHeight) < 1.25;
  const compact = Boolean(playing && (narrow || ui.hasTouch));
  setViewport(compact ? 'jeu' : 'ecran');

  // En portrait les commandes vivent sous la scène : on leur réserve la place
  // *avant* de dimensionner celle-ci, et on remonte la scène dans ce qui reste.
  // La réserve suit la taille de l'écran, pour qu'une tablette obtienne une
  // bande à sa mesure. En paysage les commandes tiennent dans les marges
  // latérales, donc rien à réserver.
  const touching = game && ui.touchActive(game.screen);
  const portrait = innerHeight > innerWidth;
  stage.reservedBottom = touching && portrait
    ? Math.round(Math.min(300, Math.max(200, innerHeight * 0.22)))
    : 0;
  stage.verticalBias = touching && ui.touchLayout === 'bande' ? 0.14 : 0.5;
  stage.resize();
  const ctx = stage.begin();

  if (error) return drawError(ctx, error);
  if (!game) return;

  if (input.anyInteraction) game.audio.unlock();
  if (input.consume('m')) game.audio.toggleMute();
  while (ui.commands.length) runCommand(ui.commands.shift());

  game.showKeyHints = !ui.touchActive(game.screen) && !compact;
  game.showHud = !compact;
  game.update(dt, input);
  game.draw(ctx, stage.pixelsPerUnit);
  ui.sync(game.screen, {
    muted: game.audio.muted,
    overview: game.wideView,
    zoomable: game.zoomable,
  });
  input.endFrame();
  updateBar();
}

function drawError(ctx, message) {
  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, render.STAGE_W, render.STAGE_H);
  drawText(ctx, 'Erreur de chargement', render.STAGE_W / 2, render.STAGE_H / 2 - 10,
    { size: 14, color: '#ff6b5e' });
  drawText(ctx, message, render.STAGE_W / 2, render.STAGE_H / 2 + 10,
    { size: 10, color: '#c9b8b0', weight: '400' });
}

let lastBar = '';
function updateBar() {
  const info = document.getElementById('bar-info');
  const meta = game?.config?.meta;
  const text = error ? error : [
    game.config.name,
    game.screen === PLAY ? `niveau ${game.levelIndex + 1}/${game.config.levels.length}` : null,
    `${game.totalTraveled} m`,
    meta?.seed ? `graine ${meta.seed}` : null,
  ].filter(Boolean).join(' · ');
  if (text !== lastBar) {
    info.textContent = text;
    lastBar = text;
  }
}

async function boot() {
  try {
    const [assets, campaign] = await Promise.all([loadAssets(), loadCampaign()]);
    campaignCfg = originalConfig(campaign);
    game = new Game(assets, new AudioPlayer(assets), campaignCfg);

    const shared = readUrl();
    if (shared?.mode === 'campagne') {
      game.goto(RULES);
    } else if (shared) {
      // Lien partagé : on entre directement dans le donjon demandé.
      ui.adopt(shared);
      game.setConfig(randomConfig(shared));
      game.start(shared.seed);
      // ?niveau=N saute à un niveau donné : indispensable pour éprouver une
      // grande grille sans devoir traverser les précédentes.
      const level = Number(new URLSearchParams(location.search).get('niveau'));
      if (level >= 2 && level <= game.config.levels.length) game.loadLevel(level - 1);
    } else {
      // Raccourci de développement : ?ecran=setup|pause|credits|… ouvre
      // directement l'écran voulu, ce qui rend les captures reproductibles.
      const wanted = new URLSearchParams(location.search).get('ecran');
      if (wanted === 'pause') game.start('demo');
      game.goto(wanted || MENU);
    }
  } catch (err) {
    error = String(err.message || err);
    document.getElementById('bar-info').textContent = error;
    console.error(err);
  }
}

// Un onglet mis en arrière-plan sur iPhone peut ne jamais revenir : les mètres
// encore en mémoire rejoignent le passeport avant qu'il disparaisse.
for (const evenement of ['pagehide', 'visibilitychange']) {
  addEventListener(evenement, () => {
    if (evenement === 'visibilitychange' && !document.hidden) return;
    noterPasseport({ deposer: true });
  });
}

// ?debug expose l'état interne : indispensable pour diagnostiquer depuis un
// navigateur piloté, où l'on ne peut pas poser de point d'arrêt.
if (new URLSearchParams(location.search).has('debug')) {
  Object.defineProperty(window, 'mfa', { get: () => ({ game, ui, input, stage }) });
}

boot();
requestAnimationFrame(frame);
