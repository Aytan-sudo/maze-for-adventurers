/**
 * Modèle de grille — commun aux labyrinthes extraits du Scratch d'origine et à
 * ceux que produira le générateur (étape 4). Le moteur ne fait pas la
 * différence entre les deux.
 *
 * Repérage : cellule (i, j) avec i = colonne, j = ligne, **ligne 0 en haut**.
 *
 * Stockage : un octet par cellule, deux bits utiles — mur nord, mur ouest.
 * Chaque mur intérieur n'est donc décrit qu'une fois (par la cellule qui l'a au
 * nord ou à l'ouest), ce qui rend impossible l'incohérence classique où deux
 * cellules voisines ne s'accordent pas sur le mur qui les sépare.
 *
 * Le bord extérieur n'est pas stocké : il est toujours fermé.
 */

export const NORTH = 0, EAST = 1, SOUTH = 2, WEST = 3;

/** Décalage (di, dj) associé à chaque direction. */
export const DELTA = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Direction inverse, pour remonter un chemin ou éviter un demi-tour. */
export const OPPOSITE = [SOUTH, WEST, NORTH, EAST];

export const DIRECTIONS = [NORTH, EAST, SOUTH, WEST];

const BIT_NORTH = 1, BIT_WEST = 2;

export class Maze {
  /** @param {number} n taille du côté @param {Uint8Array} cells n×n octets */
  constructor(n, cells) {
    this.n = n;
    this.cells = cells;
  }

  /** Grille pleine : tous les murs debout. Point de départ d'un générateur. */
  static solid(n) {
    return new Maze(n, new Uint8Array(n * n).fill(BIT_NORTH | BIT_WEST));
  }

  /**
   * Décode le format de `assets/data/mazes.json` : 2 bits par cellule
   * (nord puis ouest), MSB d'abord, parcours ligne par ligne.
   */
  static fromPacked(n, base64) {
    const bin = atob(base64);
    const cells = new Uint8Array(n * n);
    let b = 0;
    const pull = () => {
      const v = (bin.charCodeAt(b >> 3) & (0x80 >> (b & 7))) !== 0;
      b++;
      return v;
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let v = 0;
        if (pull()) v |= BIT_NORTH;
        if (pull()) v |= BIT_WEST;
        cells[j * n + i] = v;
      }
    }
    return new Maze(n, cells);
  }

  contains(i, j) {
    return i >= 0 && j >= 0 && i < this.n && j < this.n;
  }

  hasWall(i, j, dir) {
    const n = this.n;
    switch (dir) {
      case NORTH: return (this.cells[j * n + i] & BIT_NORTH) !== 0;
      case WEST: return (this.cells[j * n + i] & BIT_WEST) !== 0;
      // Les murs sud et est appartiennent au voisin ; en bordure ils sont
      // implicites et toujours fermés.
      case SOUTH: return j === n - 1 || (this.cells[(j + 1) * n + i] & BIT_NORTH) !== 0;
      case EAST: return i === n - 1 || (this.cells[j * n + i + 1] & BIT_WEST) !== 0;
      default: throw new Error(`direction inconnue : ${dir}`);
    }
  }

  /** Vrai si l'on peut passer de (i, j) vers la cellule voisine dans `dir`. */
  canMove(i, j, dir) {
    return !this.hasWall(i, j, dir);
  }

  setWall(i, j, dir, solid) {
    const n = this.n;
    // On ramène toujours l'écriture sur le bit nord ou ouest du propriétaire.
    let owner, bit;
    switch (dir) {
      case NORTH: owner = [i, j]; bit = BIT_NORTH; break;
      case WEST: owner = [i, j]; bit = BIT_WEST; break;
      case SOUTH: owner = [i, j + 1]; bit = BIT_NORTH; break;
      case EAST: owner = [i + 1, j]; bit = BIT_WEST; break;
      default: throw new Error(`direction inconnue : ${dir}`);
    }
    const [oi, oj] = owner;
    if (!this.contains(oi, oj)) {
      throw new Error(`le bord extérieur est implicite et immuable (${i},${j} vers ${dir})`);
    }
    const k = oj * n + oi;
    if (solid) this.cells[k] |= bit;
    else this.cells[k] &= ~bit;
  }

  /** Ouvre un passage entre (i, j) et son voisin. Utilisé par les générateurs. */
  open(i, j, dir) {
    this.setWall(i, j, dir, false);
  }
}

/**
 * Charge la campagne d'origine : les quatre labyrinthes extraits du `.sb3`.
 * @returns {Promise<Array<{id, start, algo, source, maze: Maze}>>}
 */
export async function loadCampaign(url = 'assets/data/mazes.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`chargement de ${url} : ${res.status}`);
  const data = await res.json();
  if (data.format !== 'mfa-maze-1') {
    throw new Error(`format de labyrinthe inattendu : ${data.format}`);
  }
  return data.mazes.map(m => ({
    id: m.id,
    start: m.start,
    algo: m.algo,
    source: m.source,
    maze: Maze.fromPacked(m.n, m.walls),
  }));
}

/**
 * Distances en nombre de cellules depuis (si, sj), par parcours en largeur.
 * Les cellules inatteignables valent -1 — ce qui n'arrive pas sur un
 * labyrinthe parfait, mais rend la fonction sûre si on lui en donne un autre.
 * @returns {Int32Array} indexé par j * n + i
 */
export function distancesFrom(maze, si, sj) {
  const n = maze.n;
  const dist = new Int32Array(n * n).fill(-1);
  dist[sj * n + si] = 0;
  // File circulaire sur un tableau plat : sur le 34×34 cela évite les milliers
  // de `shift()` qui décalent tout le tableau à chaque cellule visitée.
  const queue = new Int32Array(n * n);
  queue[0] = sj * n + si;
  let head = 0, tail = 1;

  while (head < tail) {
    const k = queue[head++];
    const i = k % n, j = (k / n) | 0;
    const d = dist[k] + 1;
    for (const dir of DIRECTIONS) {
      if (maze.hasWall(i, j, dir)) continue;
      const [di, dj] = DELTA[dir];
      const nk = (j + dj) * n + (i + di);
      if (dist[nk] === -1) {
        dist[nk] = d;
        queue[tail++] = nk;
      }
    }
  }
  return dist;
}

/**
 * Choisit une cellule de sortie loin du départ.
 *
 * Le Scratch d'origine tirait la sortie au hasard n'importe où : elle pouvait
 * tomber sur le héros et le niveau se bouclait aussitôt. On garde le tirage
 * aléatoire — c'est ce qui fait qu'on ne rejoue jamais deux fois le même
 * niveau — mais restreint aux cellules situées à au moins `ratio` fois la
 * distance maximale.
 */
export function pickFarCell(maze, si, sj, rng, ratio = 0.6) {
  const dist = distancesFrom(maze, si, sj);
  let max = 0;
  for (const d of dist) if (d > max) max = d;

  const threshold = max * ratio;
  const candidates = [];
  for (let k = 0; k < dist.length; k++) {
    if (dist[k] >= threshold) candidates.push(k);
  }
  const k = rng.pick(candidates);
  return { i: k % maze.n, j: (k / maze.n) | 0, distance: dist[k], maxDistance: max };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Générateurs
 *
 * Tous deux produisent un labyrinthe *parfait* : toutes les cellules
 * atteignables, un seul chemin entre deux points, aucune boucle — exactement
 * comme les quatre grilles extraites du Scratch d'origine.
 *
 * Le choix de l'algorithme change le caractère du donjon, pas sa validité :
 * mesuré sur les labyrinthes d'origine, le backtracker donne ~10 % d'impasses
 * et aucun croisement en croix, là où Prim monte à ~27 % d'impasses.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Voisins dans la grille, sous forme de [direction, i, j]. */
function neighbours(n, i, j) {
  const out = [];
  for (const dir of DIRECTIONS) {
    const [di, dj] = DELTA[dir];
    const ni = i + di, nj = j + dj;
    if (ni >= 0 && nj >= 0 && ni < n && nj < n) out.push([dir, ni, nj]);
  }
  return out;
}

/**
 * Backtracker récursif — le style des labyrinthes d'origine.
 *
 * On creuse tant qu'on peut, on revient sur ses pas quand on est coincé. La
 * marche s'enfonce loin avant de refluer, d'où de longs couloirs sinueux et peu
 * d'impasses. Pile explicite plutôt que récursion : sur une grande grille, le
 * chemin peut couvrir toutes les cellules et dépasser la pile d'appels.
 */
export function generateBacktracker(n, rng) {
  const maze = Maze.solid(n);
  const visited = new Uint8Array(n * n);
  const start = [rng.int(0, n - 1), rng.int(0, n - 1)];
  visited[start[1] * n + start[0]] = 1;
  const stack = [start];

  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const options = neighbours(n, i, j).filter(([, ni, nj]) => !visited[nj * n + ni]);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dir, ni, nj] = rng.pick(options);
    maze.open(i, j, dir);
    visited[nj * n + ni] = 1;
    stack.push([ni, nj]);
  }
  return maze;
}

/**
 * Algorithme de Prim aléatoire — le style du labyrinthe `maze500`.
 *
 * On fait croître le labyrinthe depuis une cellule en ouvrant à chaque tour un
 * mur tiré au hasard sur toute la frontière. La croissance est buissonnante et
 * non filaire : beaucoup plus d'impasses courtes, et des carrefours.
 */
export function generatePrim(n, rng) {
  const maze = Maze.solid(n);
  const inMaze = new Uint8Array(n * n);
  const frontier = [];

  const absorb = (i, j) => {
    inMaze[j * n + i] = 1;
    for (const [dir, ni, nj] of neighbours(n, i, j)) {
      if (!inMaze[nj * n + ni]) frontier.push([i, j, dir, ni, nj]);
    }
  };
  absorb(rng.int(0, n - 1), rng.int(0, n - 1));

  while (frontier.length) {
    const k = Math.floor(rng.next() * frontier.length);
    const [i, j, dir, ni, nj] = frontier[k];
    // Retrait par échange avec le dernier : `splice` au milieu d'un tableau de
    // plusieurs milliers d'entrées recopierait tout à chaque tour.
    frontier[k] = frontier[frontier.length - 1];
    frontier.pop();
    // La cellule visée a pu être absorbée depuis que ce mur est en attente.
    if (inMaze[nj * n + ni]) continue;
    maze.open(i, j, dir);
    absorb(ni, nj);
  }
  return maze;
}

export const GENERATORS = {
  backtracker: generateBacktracker,
  prim: generatePrim,
};

/** @param {'backtracker'|'prim'} algo */
export function generateMaze(n, rng, algo = 'backtracker') {
  const build = GENERATORS[algo];
  if (!build) throw new Error(`générateur inconnu : ${algo}`);
  return build(n, rng);
}
