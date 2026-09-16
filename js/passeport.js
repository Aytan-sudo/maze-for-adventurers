/**
 * Le passeport commun : le tampon Aventure de Maze for Adventurers.
 *
 * Règle retenue : **le trésor trouvé** donne le tampon tout de suite ; sinon
 * c'est le **cent-cinquantième mètre** marché dans la journée, toutes parties
 * confondues, morts comprises. Le mètre est la case franchie — le compteur que
 * la barre du bas affiche déjà. À titre de repère, le plus court chemin d'un
 * petit donjon « Promenade » fait 68 m, celui d'un Moyen/Normal 250 m, et l'on
 * erre toujours deux à trois fois plus que le plus court chemin.
 *
 * En mode invité, rien n'est compté ni écrit : le jeu se comporte exactement
 * comme avant le raccordement.
 */

const JEU = 'maze-for-adventurers';
const ESPACE = 'maze';
const CLE = 'maze.passeport';

/**
 * Mètres accumulés en mémoire avant d'écrire. Au pas de course le héros franchit
 * une case toutes les 130 ms : écrire à chaque pas ferait sept accès au stockage
 * par seconde, pendant que la boucle de jeu tient ses 60 images.
 */
const PAS_ECRITURE = 5;

/**
 * L'espace du joueur, mémorisé : `stockageJeu` fabrique un adaptateur à chaque
 * appel. `null` en mode invité, et le profil est fixé à l'ouverture de l'onglet.
 */
let espace;
export function espacePasseport() {
  if (espace !== undefined) return espace;
  espace = globalThis.Passeport?.stockageJeu(ESPACE) ?? null;
  return espace;
}

/**
 * Ajoute des mètres au compte du jour et renvoie le total.
 * Exporté pour être éprouvé sans navigateur.
 * @returns {number|null} le total du jour, ou `null` en mode invité
 */
export function compterMetresPasseport(jour, metres, espaceJoueur = espacePasseport()) {
  if (!espaceJoueur) return null;                           // invité : rien ne compte
  if (!Number.isInteger(metres) || metres <= 0) return null;
  let compte = null;
  try { compte = JSON.parse(espaceJoueur.getItem(CLE)); } catch { /* illisible : on repart */ }
  const acquis = compte?.jour === jour && Number.isInteger(compte.metres) ? compte.metres : 0;
  const total = acquis + metres;
  try { espaceJoueur.setItem(CLE, JSON.stringify({ jour, metres: total })); }
  catch { /* le passeport signale l'échec lui-même */ }
  return total;
}

/** Mètres marchés depuis la dernière écriture. */
let enAttente = 0;

/**
 * Le tampon du passeport.
 * @param {{metres?: number, reussite?: boolean, deposer?: boolean}} options
 *   `metres` : cases franchies depuis le dernier appel ; `reussite` : le trésor
 *   est trouvé ; `deposer` : écrire les mètres en attente sans attendre le
 *   prochain palier (on quitte le labyrinthe, ou la page passe en arrière-plan).
 */
export function noterPasseport({ metres = 0, reussite = false, deposer = false } = {}) {
  const joueur = globalThis.Passeport;
  if (!joueur?.profilId) { enAttente = 0; return; }
  enAttente += metres;
  if (!reussite && !deposer && enAttente < PAS_ECRITURE) return;
  const total = compterMetresPasseport(joueur.jourLocal(), enAttente);
  enAttente = 0;
  // Un dépôt sans un mètre à inscrire n'a rien à annoncer ; une réussite, si.
  if (total === null && !reussite) return;
  joueur.noter(JEU, total ?? 0, reussite);
}
