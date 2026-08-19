/**
 * Point d'entrée : chargement, boucle de jeu, redimensionnement.
 */

import { loadAssets } from './assets.js';
import { loadCampaign } from './maze.js';
import { Input } from './input.js';
import { AudioPlayer } from './audio.js';
import { Game, MENU, SETUP, RULES, PLAY } from './screens.js';
import { originalConfig, randomConfig, readUrl } from './config.js';
import { Ui, shareUrl } from './ui.js';
import { Stage, STAGE_W, STAGE_H, COLORS, drawText } from './render.js';

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

  // Les commandes tactiles vivent sous la scène : on la remonte pour leur
  // laisser la place au lieu de la centrer entre deux bandes noires.
  stage.verticalBias = game && ui.touchActive(game.screen) && ui.touchLayout === 'bande'
    ? 0.14 : 0.5;
  stage.resize();
  const ctx = stage.begin();

  if (error) return drawError(ctx, error);
  if (!game) return;

  if (input.anyInteraction) game.audio.unlock();
  if (input.consume('m')) game.audio.toggleMute();
  while (ui.commands.length) runCommand(ui.commands.shift());

  game.showKeyHints = !ui.touchActive(game.screen);
  game.update(dt, input);
  game.draw(ctx, stage.pixelsPerUnit);
  ui.sync(game.screen, { muted: game.audio.muted });
  input.endFrame();
  updateBar();
}

function drawError(ctx, message) {
  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  drawText(ctx, 'Erreur de chargement', STAGE_W / 2, STAGE_H / 2 - 10,
    { size: 14, color: '#ff6b5e' });
  drawText(ctx, message, STAGE_W / 2, STAGE_H / 2 + 10,
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

boot();
requestAnimationFrame(frame);
