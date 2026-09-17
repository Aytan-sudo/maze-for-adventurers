# Maze for Adventurers — portage navigateur

**▶ Jouer : <https://aytan-sudo.github.io/maze-for-adventurers/>**

Portage web du jeu Scratch **Maze for Adventurers** (Aymeric Cantais), publié
sur GitHub Pages et référencé sur le
[hub de jeux](https://aytan-sudo.github.io/hub-gaming/).

Le projet Scratch d'origine est conservé tel quel dans
`Old_Scratch/Maze for Adventurers.sb3` — c'est la source de vérité pour tous les
assets et pour la logique de jeu.

> **Reprise de session :** lire `TODO.md` en premier. Il contient l'état
> d'avancement, l'étape en cours et le journal des sessions. Ce README-ci
> contient les décisions figées et les données de référence — il évite d'avoir à
> ré-analyser le `.sb3`.

---

## 1. Le jeu

Un aventurier explore une suite de labyrinthes en vue de dessus. Chaque niveau
contient un escalier qui mène au suivant ; le dernier contient un coffre au
trésor. Des minotaures errent dans les couloirs.

**La mécanique centrale :** tenir la touche `W` fait *marcher lentement*. C'est
plus lent, mais au contact d'un minotaure on survit avec 49 chances sur 50. Sans
`W`, tout contact est mortel. Tout le jeu est un arbitrage entre vitesse et
prudence.

### Enchaînement des écrans (identique à l'original)

```
Start_Menu ──espace──▶ rules ──espace──▶ Level_1 ─escalier─▶ Level_2 ─escalier─▶ Level_3
                                                                                    │
                                                              Victory ◀──coffre── Level_4
                                                                 │                  │
                                                              credits ◀─── dead ◀───┘
```

L'écran `dead` est atteint depuis n'importe quel niveau au contact fatal d'un
minotaure. `credits` est le terminus dans les deux cas.

---

## 2. Données de référence extraites du `.sb3`

Cette section est le résultat de l'analyse complète du projet Scratch. **Elle
n'a pas besoin d'être refaite.**

### 2.1 Structure du projet Scratch

- 25 sprites : `Stage`, `Maze_1..4`, `Hero`, `stairs`, `minotaur`, `Treasure`,
  `Score`, `minotaur2..16`
- ~1 300 blocs, aucune extension, aucune liste, uniquement des variables globales
- Les 16 minotaures sont des copies manuelles du même sprite (pas des clones)

### 2.2 Les quatre labyrinthes

Stockés en PNG 720×720 noir et blanc **encapsulés dans du SVG**. Aucun
anti-aliasing, tracé parfaitement régulier — l'extraction de grille est exacte.

| Niveau | Sprite   | Costume       | Grille | Pas cellule (u) | Pas héros (u) | Minotaures |
|--------|----------|---------------|--------|-----------------|---------------|------------|
| 1      | `Maze_1` | `Maze_10_10`  | 10×10  | 34              | 17 (½)        | 0          |
| 2      | `Maze_2` | `Maze_17_17`  | 17×17  | 20              | 5 (¼)         | 2          |
| 3      | `Maze_3` | `maze500`     | 17×17  | 20              | 5 (¼)         | 4          |
| 4      | `Maze_4` | `Maze_34_34`  | 34×34  | 10              | 5 (½)         | 16         |

**Géométrie dans l'image PNG** (identique pour les 4) : bordure noire de la
grille dans la boîte englobante `x,y ∈ [20, 701]`, épaisseur de mur 2 px,
origine `O = 20`, pas en pixels = `2 × pas cellule`. Le PNG est affiché à
360×360 dans le SVG, centré sur la scène Scratch 480×360, donc le labyrinthe
couvre `x ∈ [-180, 180]` et `y ∈ [-180, 180]` en coordonnées Scratch.

**Topologie** (vérifiée par BFS — les quatre sont des labyrinthes *parfaits*,
toutes cellules atteignables) :

| Labyrinthe | Cellules | Impasses | Couloirs | Jonctions T | Croix | Algorithme déduit |
|------------|----------|----------|----------|-------------|-------|-------------------|
| 10×10      | 100      | 12,0 %   | 78,0 %   | 10,0 %      | 0     | backtracker récursif |
| 17×17 (n°2)| 289      | 10,7 %   | 79,2 %   | 10,0 %      | 0     | backtracker récursif |
| `maze500`  | 289      | 27,0 %   | 49,8 %   | 20,1 %      | 9     | Prim / Kruskal (source externe) |
| 34×34      | 1156     | 9,3 %    | 81,7 %   | 8,8 %       | 2     | backtracker récursif |

Le taux d'impasses ~10 % et la rareté des croisements à 4 branches sont la
signature du backtracker récursif. Le générateur du portage utilise donc le
**backtracker récursif par défaut** (style maison) avec **Prim en option**
(style `maze500`).

Un backtracker n'exclut pas totalement les croisements en croix : quand la pile
redescend sur une cellule déjà traversée, elle peut lui creuser une troisième
puis une quatrième ouverture. C'est marginal — 0, 0 et 2 sur les grilles
d'origine, ~0,1 % sur celles du générateur — mais `tools/check-rules.mjs`
vérifie donc un taux et non une absence.

### 2.3 Positions de départ (converties en coordonnées de grille)

Convention du portage : cellule `(col, row)`, `row 0 = en haut`.

| Niveau | Héros Scratch (x, y) | Cellule (col, row) |
|--------|----------------------|--------------------|
| 1      | (17, 17)             | (5, 4)             |
| 2      | (0, 0)               | (8, 8)             |
| 3      | (0, 0)               | (8, 8)             |
| 4      | (5, 5)               | (17, 16)           |

Escalier / coffre : placés aléatoirement sur un centre de cellule à chaque
partie. L'aléa Scratch excluait la première colonne et la première rangée de
chaque labyrinthe (`17 + 34 × random(-4,4)` sur une grille dont les centres vont
de `-153` à `153`) — **ce quirk n'est pas conservé**.

### 2.4 Mécanique des minotaures

```
auto_move:
    direction ← aléatoire dans {1,2,3,4}
    attendre 0,05 s ; avancer de mino_pas dans cette direction
    si contact avec du noir : revenir à la position précédente
    si contact avec le héros :
        chance ← aléatoire dans [1, 50]
        si (chance < 50 ET touche W enfoncée) : rien
        sinon : mort
```

Marche aléatoire pure : la direction est retirée au sort à *chaque* pas, sans
mémoire. Répartition par niveau : 0 / 2 / 4 / 16.

### 2.5 Assets

**Images** (les SVG contiennent des PNG en base64, extraits par le script)

| Nom          | Source `.sb3`                          | Dimensions | Rôle |
|--------------|----------------------------------------|------------|------|
| `start_menu` | `c37ca989…png`                         | 960×720    | écran titre |
| `rules`      | `3d88cff6…svg` (PNG embarqué)          | 960×720    | écran de règles |
| `dead`       | `13e2e626…svg` (PNG embarqué)          | 960×720    | écran de mort |
| `victory`    | `8de16831…svg` (PNG embarqué)          | 566×505    | coffre de victoire |
| `credits`    | `e5391e0f…png`                         | 960×720    | crédits |
| `hero`       | `1f1a310a…svg` (PNG embarqué)          | 200×200    | sprite héros |
| `minotaur`   | `ca6a01e0…png`                         | 200×200    | sprite minotaure |
| `stairs`     | `5f93dd3f…png`                         | 200×200    | sprite escalier |
| `treasure`   | `3cd67e34…png`                         | 200×200    | sprite coffre |

**Sons**

| Nom         | Source                | Durée   | Poids d'origine | Usage |
|-------------|-----------------------|---------|-----------------|-------|
| `Menu`      | `ea26ac72…wav`        | 119,4 s | 5,2 Mo          | musique du menu |
| `Adventure` | `7d2badb0…mp3`        | 138,8 s | 3,3 Mo          | musique des niveaux |
| `credits`   | `08d6c5ce…mp3`        | 184,5 s | 7,4 Mo          | musique des crédits |
| `Dead`      | `b0bd3b65…wav`        | 4,9 s   | 470 Ko          | jingle de mort |
| `pop`       | `83a97874…wav`        | 0,02 s  | 560 o           | bruitage |

L'audio représente 15,9 Mo des 16,2 Mo du `.sb3`. Il est ré-encodé par le
script d'extraction et chargé à la demande.

---

## 3. Décisions de portage (arbitrées, ne pas rediscuter sans raison)

| Sujet | Décision |
|---|---|
| **Déplacement** | **Case par case**, avec animation de glissement. Abandon du demi/quart de pas et de la collision pixel. |
| **Collision** | Modèle de grille pur (test d'adjacence de mur). Plus de `touching color`. |
| **Audio** | Ré-encodé en MP3 96 kbps (musiques) / 128 kbps (jingle), chargé paresseusement. ~5 Mo au lieu de 15,9. |
| **Rejouer** | Bouton ajouté. L'original bloquait sur l'écran des crédits. |
| **Sortie** | Placée aléatoirement mais à une distance BFS ≥ 60 % du maximum depuis le départ. Corrige le bug « escalier sur le héros » tout en gardant de la rejouabilité. |
| **Compteur `Traveled`** | Ne compte que les pas réellement effectués. L'original comptait aussi les pas bloqués contre un mur. |
| **Quirk des colonnes exclues** | Non conservé. |
| **Générateur** | Ajouté (voir §4). |
| **Écran de règles** | Image d'origine gardée en fond, texte réel superposé en HTML (les contrôles ont changé : tactile, configuration). |
| **Rendu** | Murs dessinés en vectoriel sur `<canvas>` (net à toute résolution), sprites d'origine par-dessus. |
| **Mobile** | Les contrôles tactiles occupent les bandes laissées par la scène 4:3, jamais le labyrinthe. **Question encore ouverte :** la lisibilité d'un 34×34 sur un écran étroit — voir la section « À penser » de `TODO.md`. |
| **Build** | Aucun. Modules ES natifs, site statique. |
| **Touches** | Flèches **ou ZQSD** pour se déplacer. `W` reste la marche lente, comme l'affiche l'écran de règles — ce qui **interdit WASD**. `Shift` est accepté en second choix, `V` maintenue donne un coup d'œil sur tout le labyrinthe, `M` coupe le son, `Échap` ou `P` met en pause. |
| **Tactile** | D-pad et bascule « marcher lentement », posés dans la place que la scène laisse autour d'elle (bande basse en portrait, bandes latérales en paysage) — jamais par-dessus le labyrinthe. **Leur taille suit cette place** au lieu d'être fixée : 60 px de flèche sur un téléphone, 81 px sur un iPad. La marche lente est une bascule, pas un maintien. |
| **Deux formats de scène** | 480×360 pour les écrans (les images ont été dessinées pour ce 4:3), **360×360 pendant une partie sur écran étroit ou tactile**. Le labyrinthe étant carré, il est bridé par la hauteur : supprimer les marges latérales lui rend 34 % de taille sur un écran étroit, et sur une tablette en paysage les rend aux commandes tactiles sans rien lui coûter. Le HUD passe alors dans la barre du bas. |
| **Zoom tactile** | Interdit (`user-scalable=no` dans le viewport, `touch-action: none` sur les zones de jeu) : un double-tap sur une flèche du D-pad zoomait la page au lieu de faire un pas. La mention manquait au viewport ; le vérificateur iOS l'a relevée. |
| **Hauteur de page** | `100dvh`, pas `100%` : sur iPhone, `100 %` vaut la hauteur barres rétractées, et après une rotation le bas de la page — barre d'outils comprise — se retrouvait coupé. Le corps est fixe et `overflow: hidden`, pour que la page ne puisse pas glisser sous les barres. |
| **Caméra** | Au-delà de 11 cellules de large, la vue suit le héros ; le bouton « Vue d'ensemble » montre toute la grille, et `V` maintenue la montre le temps qu'on la garde enfoncée — une bascule demande deux appuis, c'est déjà trop quand un minotaure fonce. Le HUD rappelle la touche comme il rappelle `W`. Sans zoom on garde la texture mémorisée, avec zoom on trace les murs directement — une texture assez fine pour ce grossissement pèserait des dizaines de Mo. |
| **Icônes** | Engendrées par `tools/make-icons.mjs`, qui appelle le générateur du jeu avec une graine fixe : l'icône est littéralement un donjon du jeu. Encodeur PNG inclus, aucune dépendance. |
| **Jet de survie** | Relancé **une seule fois par contact**, et réarmé quand le minotaure s'éloigne. L'original relançait le dé ~20 fois par seconde : même en marchant lentement, frôler un minotaure une seconde était mortel. |
| **Cadences** | Héros 130 ms/case en courant, 320 en marche lente ; minotaure 220. Courir distance un minotaure, marcher lentement non — c'est ce qui donne son sel au choix, puisque seule la marche lente protège. |
| **Minotaures** | Marche aléatoire sans demi-tour immédiat (sauf en impasse) : ils patrouillent au lieu de trembler sur place. Ils n'apparaissent jamais à moins de `max(3, n/4)` cases du héros. |

---

## 4. Modes de jeu

### Campagne originale
Les 4 labyrinthes extraits, dans l'ordre, avec 0 / 2 / 4 / 16 minotaures.

### Donjon aléatoire
Panneau de composition (`js/ui.js`, surcouche HTML par-dessus le canevas) :

| Réglage | Valeurs |
|---|---|
| Taille | Petit 10×10 · Moyen 17×17 · Grand 25×25 · Immense 34×34 |
| Difficulté | Promenade · Normal · Difficile · Cauchemar |
| Tracé | Sinueux (backtracker) · Buissonnant (Prim) |
| Graine | champ libre, ou bouton « Tirer » |

| Difficulté | Niveaux | Facteur minotaures | Protection `W` |
|------------|---------|--------------------|----------------|
| Promenade  | 2       | ×0                 | 49/50          |
| Normal     | 4       | ×1                 | 49/50          |
| Difficile  | 6       | ×2                 | 49/50          |
| Cauchemar  | 8       | ×3                 | 45/50 (9/10)   |

**Taille des niveaux.** Le réglage donne la taille du **dernier** niveau ; les
précédents montent en puissance depuis `max(8, round(n / 2,5))` :

```
levelSize(n, k, L) = round(minN + (n − minN) × k / (L − 1))
```

Sur Immense / Normal cela donne 14 → 21 → 27 → 34, comparable à la progression
d'origine (10 → 17 → 17 → 34). Le plancher à 8 évite un premier niveau si petit
qu'il se traverse sans réfléchir, et la rampe évite huit grilles géantes
d'affilée.

**Nombre de minotaures.**

```
levelMinotaurs(n, k, L, f) = round(n² × 0,014 × f × k / (L − 1))
```

Nul au premier niveau, maximal au dernier. La densité de référence 0,014 est
calée sur l'original : 16 minotaures sur les 1 156 cellules du 34×34. Immense /
Normal donne 0 / 3 / 7 / 16, soit à peu près l'original.

**Graine.** PRNG mulberry32 semé depuis une chaîne, du genre `oubliette-482`.
Chaque niveau tire d'une graine dérivée (`graine~k~algo`) : ajouter un niveau ne
redessine donc pas les précédents. Même graine ⇒ même donjon, au bit près.

**Partage.** La configuration est écrite dans l'URL par `history.replaceState`,
donc copier la barre d'adresse suffit à partager un donjon :

```
?graine=oubliette-482&taille=grand&difficulte=difficile&trace=prim
?mode=campagne
```

Un lien contenant une graine entre **directement** dans le donjon ; la campagne
et le menu passent par l'écran de règles, comme dans l'original.

## 5. Architecture

```
Maze_For_Adventurers/
├── index.html
├── manifest.webmanifest
├── README.md                    ← ce fichier
├── TODO.md                      ← état d'avancement, à lire en premier
├── Old_Scratch/
│   └── Maze for Adventurers.sb3 ← source de vérité, ne pas modifier
├── tools/
│   └── extract-sb3.mjs          ← régénère tout le contenu de assets/
├── assets/
│   ├── data/mazes.json          ← les 4 grilles d'origine, bit-packées
│   ├── img/                     ← 9 images
│   └── audio/                   ← 5 sons ré-encodés
├── css/
│   └── style.css
├── manifest.webmanifest
├── tools/
│   ├── extract-sb3.mjs      régénère assets/ depuis le .sb3
│   ├── check-rules.mjs      simule des parties en Node, sans navigateur
│   └── make-icons.mjs       engendre les icônes (encodeur PNG inclus)
└── js/
    ├── main.js       amorçage, boucle rAF, redimensionnement
    ├── rng.js        PRNG semé (mulberry32) + hachage de graine
    ├── maze.js       modèle de grille, décodage, BFS, générateurs
    ├── level.js      règles d'un niveau : héros, minotaures, sortie
    ├── entities.js   déplacement de case en case
    ├── assets.js     chargement des images d'après le manifeste
    ├── render.js     dessin canvas
    ├── input.js      clavier + commandes tactiles
    ├── audio.js      chargement paresseux, sourdine persistante
    ├── ui.js         panneaux HTML, barre d'outils, D-pad
    ├── passeport.js  tampon du passeport : mètres du jour, trésor
    └── screens.js    machine à états des écrans
└── commun/                      ← copie du module du hub, distribuée
    ├── passeport.js             ← ne pas modifier ici : la source est dans HUB/
    ├── liaison.js
    └── passeport.css
```

### Format de grille

Un labyrinthe, qu'il vienne du `.sb3` ou du générateur, est **toujours** le même
objet :

```js
{ n: 17, walls: Uint8Array }   // 2 bits par cellule : mur nord, mur ouest
```

Indexation `(col i, row j)`, `row 0 = en haut`. Le bord extérieur est
**implicite** (toujours fermé) et n'est pas stocké. Le moteur ne fait aucune
différence entre un labyrinthe d'origine et un labyrinthe généré.

Sérialisation dans `assets/data/mazes.json` : bits empaquetés MSB d'abord, dans
l'ordre `for j, for i : (nord, ouest)`, encodés en base64. Le 34×34 tient en
289 octets.

---

## 6. Commandes

```bash
# Régénérer tous les assets depuis le .sb3 (nécessite ffmpeg)
node tools/extract-sb3.mjs

# Vérifier les règles du jeu (traversées simulées, murs, jets de dé)
node tools/check-rules.mjs

# Régénérer les icônes
node tools/make-icons.mjs

# Servir en local (sans cache — indispensable pour les essais navigateur)
python3 tools/serve-dev.py 8765

# Publier sur le hub (une fois le dépôt poussé et Pages actif)
node ~/dev/python/Jeux_Pages/HUB/ajouter-jeu.mjs \
  --desc "…" --tags "…" --emoji "🏛️"

# Redistribuer le module commun du passeport (à lancer depuis le hub)
cd ~/dev/python/Jeux_Pages/HUB && npm run distribuer
```

Dépendances : **Node** (≥ 18, modules ES) et **ffmpeg** pour le ré-encodage
audio. Aucune dépendance npm — le script d'extraction lit le ZIP et décode les
PNG en Node pur.

---

## 7. Le passeport commun — 16 septembre 2026

Le jeu est raccordé au **passeport** du hub : un profil par joueur, gardé dans
le `localStorage` de `aytan-sudo.github.io`, partagé par tous les jeux de la
collection. La source du module est dans `HUB/commun/`, et `commun/` n'en est
qu'une copie distribuée — la modifier ici serait perdu au prochain
`npm run distribuer`.

**La règle du tampon**, thème *Aventure* : le **trésor trouvé** le donne tout de
suite ; sinon, ce sont **150 mètres marchés dans la journée**, toutes parties
confondues, morts comprises. Le mètre est la case franchie — le compteur que la
barre du bas affiche déjà. Repère de calibrage : le plus court chemin d'un petit
donjon « Promenade » fait 68 m, celui d'un Moyen/Normal 250 m, et l'on erre
toujours deux à trois fois plus. Le seuil se change en une ligne, dans
`HUB/commun/passeport.js` (`questions: 150`).

**Mode invité inchangé.** Sans profil, le jeu écrit là où il a toujours écrit :
`mfa.muted` dans le `localStorage` de l'appareil, et rien n'est compté. Avec un
profil, le son et le compteur vont dans l'espace du joueur.

**Ce que le raccordement a demandé au jeu :**

- `js/passeport.js` : le compteur du jour. Les mètres s'accumulent en mémoire et
  ne sont écrits que tous les 5 pas — au pas de course le héros franchit une case
  toutes les 130 ms, et le stockage n'a pas à suivre cette cadence. Ils sont
  déposés aussi dès qu'on quitte le labyrinthe et quand la page passe en
  arrière-plan, pour que mourir juste avant le seuil ne perde pas les derniers pas.
- `js/config.js` : `writeUrl` **garde `profil`**. Elle reconstruisait la requête
  de zéro ; recharger la page aurait changé de joueur.
- `js/ui.js` : en portrait, la bande des commandes tactiles prend désormais toute
  la largeur de l'**écran** et non celle de la **scène**. Rien d'autre n'habite
  cette rangée, et la mesurer sur la scène bridait les flèches dès qu'elle
  devenait carrée : sur un iPhone SE elles tombaient à 34 px avec le bandeau
  (41 px sans). Elles font maintenant 56 px, avec ou sans passeport.
- Le bandeau coûte 44 px en haut de la page. Rien ne défile nulle part, et les
  commandes tactiles n'en perdent pas un pixel.

**Hors ligne : toujours pas.** Ce jeu est le seul de la collection sans service
worker, et le raccordement n'en ajoute pas. Le passeport fonctionne en ligne ;
installé sur l'écran d'accueil, le jeu réclame toujours le réseau.

---

## 8. Crédits

- Programmation et générateur de labyrinthes originaux : **Aymeric Cantais**
- Musiques : **David Fesliyan**
- Images et graphismes : libres de droits
