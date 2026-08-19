# TODO — portage de Maze for Adventurers

> **À lire en premier à chaque reprise de session.**
> Les décisions figées et les données extraites du `.sb3` sont dans `README.md` :
> pas besoin de ré-analyser le projet Scratch.

État global : **jeu publié et sur le hub** — 6 / 6 étapes terminées.

- Jeu : <https://aytan-sudo.github.io/maze-for-adventurers/>
- Dépôt : <https://github.com/Aytan-sudo/maze-for-adventurers>
- Hub : <https://aytan-sudo.github.io/hub-gaming/>

---

## Étape 1 — Extraction des assets ✅ TERMINÉE

`tools/extract-sb3.mjs` régénère l'intégralité de `assets/` depuis le `.sb3`.
Sans dépendance npm : lecteur ZIP et décodeur PNG écrits en Node pur.

- [x] Lecteur ZIP en Node pur (pas de dépendance npm)
- [x] Décodeur PNG en Node pur (`zlib.inflateSync` + défiltrage)
- [x] Extraction des PNG embarqués en base64 dans les SVG
- [x] Détection automatique de la géométrie de grille (boîte englobante, pas par PGCD)
- [x] Extraction des 4 grilles de murs + vérification BFS (labyrinthe parfait)
- [x] Écriture de `assets/data/mazes.json` (bits empaquetés en base64)
- [x] Copie / optimisation des 9 images vers `assets/img/`
- [x] Ré-encodage ffmpeg des 5 sons vers `assets/audio/` (MP3 96k / 128k)
- [x] Exécution du script et vérification des sorties

**Résultat :** 16,56 Mo de `.sb3` → **5,40 Mo** dans `assets/`
(images 888,6 Ko → 259,7 Ko en WebP ; audio 15,69 Mo → 5,15 Mo en MP3).
Les 4 grilles tiennent en 1,5 Ko de JSON (le 34×34 en 289 octets).

**Vérifications passées :** bord extérieur fermé, labyrinthe parfait par BFS
(100/100, 289/289, 289/289, 1156/1156), aller-retour empaquetage → base64 →
dépaquetage identique au bit près, et rendu ASCII du 10×10 relu depuis le JSON
identique à celui obtenu directement depuis les pixels.

**Point de vigilance :** le manifeste `assets/data/assets.json` liste les
fichiers réellement produits. `minotaur` est resté en PNG (le WebP était plus
lourd) — le moteur doit lire le manifeste, jamais deviner l'extension.

---

## Étape 2 — Moteur de rendu ✅ TERMINÉE

- [x] `index.html` + `css/style.css` (canevas plein cadre, bandes gérées en JS)
- [x] `js/maze.js` : modèle de grille, décodage du JSON, accesseurs de murs
- [x] `js/assets.js` : chargement des images via le manifeste
- [x] `js/render.js` : tracé vectoriel des murs, sprites, écrans
- [x] Redimensionnement responsive, gestion du `devicePixelRatio`
- [x] Vérification que les 4 niveaux correspondent aux labyrinthes d'origine

**Vérification :** rendu des 4 textures en Chrome headless, relecture de leurs
pixels et reconstruction de la grille — **3 824 emplacements de mur comparés,
aucun écart**. La chaîne PNG d'origine → grille → JSON → rendu → pixels est donc
vérifiée de bout en bout.

**Choix de rendu.** Repère logique 480×360 hérité de Scratch, mis à l'échelle au
dernier moment : `MAZE_BOX = {x:70, y:10, size:340}` reproduit exactement le
carré de jeu d'origine, et les cellules retombent sur 34 / 20 / 10 unités. Les
sprites font 0,72 cellule (ratio mesuré sur les tailles Scratch). Le labyrinthe
est tracé une fois dans une texture hors écran, mémorisée tant que la
résolution ne change pas.

**Deux pièges déjà traités, à ne pas réintroduire :**
- la texture a une marge `pad` = demi-épaisseur de trait, sinon les murs du
  pourtour sont rognés de moitié et le cadre paraît deux fois plus fin ;
- la texture fait un multiple entier de `n`, sinon les cellules ne font pas
  toutes le même nombre de pixels et les murs semblent d'épaisseur inégale.

**Prévisualisation :** `?level=1..4` et `?grid` dans l'URL, ou les touches 1–4,
G (réseau de contrôle) et S (sprites). Ce bloc est balisé dans `js/main.js` et
disparaît à l'étape 3.

---

## Étape 3 — Logique de jeu ✅ TERMINÉE

- [x] `js/rng.js` : mulberry32 + hachage de chaîne vers graine
- [x] `js/input.js` : flèches, ZQSD, `W` (marche lente), `M` (sourdine)
- [x] `js/entities.js` : `Walker` / `Hero` / `Minotaur`, glissement de case en case
- [x] `js/level.js` : règles d'un niveau, rencontres, campagne d'origine
- [x] Jet de survie sous `W` (49/50, paramétrable pour Cauchemar)
- [x] Compteur `Traveled` (pas réellement effectués uniquement)
- [x] `js/screens.js` : machine à états des 6 écrans
- [x] `js/audio.js` : chargement paresseux, sourdine persistante, déverrouillage
- [x] Placement de la sortie à distance BFS ≥ 60 % du maximum

**Vérification :** `node tools/check-rules.mjs` — **30 contrôles, tous verts**.
Traversée simulée des 4 niveaux (le compteur retombe exactement sur la longueur
du plus court chemin), 22 864 pas de minotaures sans un seul mur traversé ni un
demi-tour hors impasse, 4 000 contacts pour valider les taux de mortalité
(1,8 % en marche lente, 100 % en courant, 9,9 % au réglage Cauchemar), et
reproductibilité par la graine.

**À savoir pour la suite :**
- `tools/check-rules.mjs` tourne dans Node parce que `maze.js`, `entities.js`,
  `level.js` et `rng.js` ne touchent ni au DOM ni au canevas. **Garder cette
  séparation** : c'est ce qui rend les règles testables sans navigateur.
- Le héros enchaîne le pas suivant dès l'arrivée si la direction est maintenue.
  Un pilote automatique doit donc calculer sa direction depuis la cellule
  **visée** (`hero.i/j`), pas celle quittée, sinon il dépasse d'une case.
- Le HUD occupe les marges latérales (70 unités de large), jamais le haut ni le
  bas : le carré de jeu ne laisse que 10 unités de marge verticale.
- Raccourcis de développement dans l'URL : `?skip[&level=N][&seed=X]` et
  `?screen=rules|dead|victory|credits`. À retirer ou garder à l'étape 5.

---

## Étape 4 — Générateur et configuration ✅ TERMINÉE

- [x] Backtracker récursif semé (`generateBacktracker`, pile explicite)
- [x] Prim semé (`generatePrim`, style `maze500`)
- [x] `js/config.js` : tailles, difficultés, rampe, densité de minotaures, URL
- [x] `js/ui.js` + surcouche HTML : panneau de composition
- [x] Barème de difficulté (cf. README §4)
- [x] Configuration reflétée dans l'URL, donjon partageable par lien
- [x] Mode « campagne originale » avec les 4 grilles extraites

**Vérification :** `node tools/check-rules.mjs` — **51 contrôles, tous verts**.
Les 24 grilles engendrées sont toutes des labyrinthes parfaits ; le backtracker
retombe sur 10,8 % d'impasses (grilles d'origine : 9,3 à 12,0 %), Prim sur
32,8 % (`maze500` : 27,0 %). Les 16 combinaisons taille × difficulté sont
vérifiées, et un donjon Grand/Difficile est franchi de bout en bout en
pilotage automatique.

**Découverte à ne pas oublier :** un backtracker **peut** produire un croisement
en croix, quand la pile redescend sur une cellule déjà traversée et lui creuse
une troisième puis une quatrième ouverture. C'est marginal (~0,1 %, et 0/0/2 sur
les grilles d'origine) mais réel : le contrôle vérifie donc un **taux**, pas une
absence. Une première version du test échouait pour cette raison.

**Choix d'interface.** Le panneau est en HTML, pas dessiné sur le canevas : bâti
sur de vrais `input[type=radio]`, il hérite gratuitement de la navigation au
clavier, du focus et de la lecture d'écran. Il est calé sur le cadre du jeu par
`Stage.cssRect`, pas sur le canevas entier, pour ne pas déborder sur les bandes
noires. Les boutons du menu portent leur propre bandeau dégradé, dont la hauteur
suit la leur — c'est ce qui masque proprement la ligne « Press Space » de
l'image d'accueil à toute taille d'écran.

**Raccourci de développement :** `?setup` ouvre directement le panneau.

---

## ⚠︎ À penser : un vrai mode mobile

Le jeu est né sur Scratch, au clavier, sur un écran 4:3. Le porter au tactile
n'est pas qu'une affaire de boutons à ajouter — plusieurs points demandent une
décision, pas seulement du code :

1. **La taille des cellules est le vrai problème.** Un 34×34 sur un écran de
   390 px de large donne des cellules de ~10 px : le héros et les minotaures
   deviennent illisibles, et on ne voit plus assez loin pour décider où aller.
   Trois issues possibles, à trancher :
   - une **caméra qui suit le héros** avec un zoom fixe (le plus jouable, mais
     on perd la vue d'ensemble qui fait tout le sel d'un labyrinthe) ;
   - **plafonner la taille** proposée selon la largeur de l'écran ;
   - une **vue d'ensemble momentanée** (appui long) par-dessus la vue zoomée.
2. **Portrait :** la scène 4:3 contenue dans un écran allongé laisse de larges
   bandes en haut et en bas. Ce sont elles qui doivent accueillir les
   contrôles — jamais par-dessus le labyrinthe, qu'on doit lire en entier.
3. **La marche lente doit être une bascule, pas un maintien.** Tenir deux
   doigts (direction + `W`) est intenable au pouce.
4. **Tout doit être atteignable sans clavier** : chaque écran qui attendait
   « Espace » a besoin de son bouton.
5. **Plein écran, zones sûres, pas de défilement ni de zoom accidentel**, et à
   terme un `manifest.webmanifest` pour l'installation sur l'écran d'accueil.

Les points 2 à 5 sont traités depuis l'étape 5. **Le point 1 reste ouvert** et
mérite d'être essayé sur un vrai téléphone avant de choisir.

Le point 1 s'est allégé depuis : la scène carrée sur écran étroit rend un tiers
de largeur au labyrinthe (voir « Suite » plus bas), ce qui repousse le seuil où
la lisibilité devient un problème sans le supprimer.

---

## Étape 5 — Confort navigateur ✅ TERMINÉE

- [x] D-pad tactile + bascule « marcher lentement »
- [x] Pause (Échap / P) avec reprise, recommencer, retour au menu
- [x] Boutons sur les écrans de fin : rejouer, menu
- [x] Barre d'outils : son, plein écran, pause
- [x] Sourdine persistante (`localStorage`) — faite à l'étape 3
- [x] Écran de règles : image d'origine en fond, texte réel superposé,
      libellés adaptés au tactile
- [x] Test aux dimensions d'un téléphone (portrait et paysage)
- [x] Sort du bandeau de débogage tranché : devenu la barre d'outils `#bar`

**Trois dispositions tactiles**, choisies par `Ui.layoutTouch` selon la place
laissée par la scène 4:3 — le labyrinthe n'est jamais recouvert :

| Situation | Disposition |
|---|---|
| Bande basse ≥ 108 px (portrait) | commandes collées en bas, scène remontée (`verticalBias = 0,14`) |
| Bandes latérales ≥ 96 px (paysage) | D-pad à gauche, bascule à droite |
| Ni l'un ni l'autre | surimpression au bas du cadre, en dernier recours |

**Décisions d'ergonomie :**
- la marche lente est une **bascule**, pas un maintien : tenir direction et `W`
  à la fois est intenable au pouce ;
- le rappel clavier « W » dessiné sur le canevas s'efface quand les commandes
  tactiles sont visibles, sinon il fait doublon avec la bascule ;
- l'écran de règles réécrit ses libellés au tactile (« La croix directionnelle »
  au lieu de « Flèches ou ZQSD ») ;
- `pointerdown` + `setPointerCapture` sur chaque bouton du D-pad : sans la
  capture, un doigt qui glisse hors du bouton ne renvoie pas le relâchement et
  le héros continue tout seul.

**Deux pièges rencontrés :**
- **Chrome headless impose une largeur de fenêtre minimale d'environ 500 px.**
  `--window-size=430,880` donne en réalité un viewport de 500 px et une capture
  rognée : ce n'était pas un bug de mise en page. Capturer à 500 px au minimum.
- Faire pivoter un bouton du D-pad pour orienter sa flèche transformait son coin
  arrondi en losange. C'est le **pseudo-élément** qui pivote, jamais le bouton.

**Raccourci de développement :** `?ecran=setup|pause|credits|dead|victory`
ouvre directement un écran (`?tactile` force les commandes tactiles). Conservé :
il rend les captures reproductibles.

---

## Étape 6 — Publication ✅ TERMINÉE

- [x] `manifest.webmanifest` + icônes (32, 180, 192, 512)
- [x] `git init`, premier commit
- [x] Dépôt public `Aytan-sudo/maze-for-adventurers`, push
- [x] GitHub Pages activé, jeu vérifié en ligne
- [x] Ajouté au hub (6ᵉ jeu)

**Les icônes sont engendrées, pas dessinées.** `tools/make-icons.mjs` appelle le
générateur du jeu avec la graine fixe `maze-for-adventurers` et rastérise un
labyrinthe 7×7 avec le trésor au centre. L'encodeur PNG est écrit dans le
script : les murs ne sont que des rectangles, il n'y avait rien à demander à une
bibliothèque. Aucune dépendance, aucun outil externe, résultat reproductible.

**Vérification en ligne :** les onze ressources clés répondent en 200 avec le
bon type MIME (WebP, MP3, `application/manifest+json`), et une capture de
`?graine=…&taille=grand&difficulte=normal` montre le donjon partagé jouable.

**Le hub charge ses jeux depuis `jeux.json` à l'exécution**, pas depuis le HTML :
chercher le jeu dans `index.html` ne donne rien, c'est normal. Vérifier
`https://aytan-sudo.github.io/hub-gaming/jeux.json`.

---

## Suite — scène carrée sur écran étroit ✅ FAITE

Le gain repéré à l'étape 5 s'est révélé bien plus important que prévu. Le
labyrinthe est carré : il est bridé par la **hauteur**, pas par la largeur.
Élargir le carré de jeu dans une scène 4:3 n'aurait rien donné ; c'est la scène
elle-même qui devait changer de format.

Pendant une partie sur écran étroit (`largeur / hauteur < 1,25`), la scène passe
donc de 480×360 à **360×360** et le HUD s'en va dans la barre du bas. Sur un
téléphone de 500 px, le labyrinthe passe de ~355 à ~475 px : **+34 %**.

`render.js` expose `STAGE_W`, `STAGE_H` et `MAZE_BOX` en `let` avec un
`setViewport(mode)` : les liaisons de module étant vivantes, tous les
importateurs suivent sans câblage. Le carré de jeu garde ses 340 unités de côté
dans les deux formats, donc les tailles de cellule restent celles de l'original
et le cache de texture reste valable.

---

## Reste ouvert

1. ~~Lisibilité des très grandes grilles au tactile~~ **✅ tranché** : caméra qui
   suit le héros (11 cellules visibles en largeur) plus une bascule « Vue
   d'ensemble » dans la barre, aussi accessible par la touche `V`. Sans zoom on
   garde la texture mémorisée ; avec zoom on trace les murs directement, car
   une texture assez fine pour ce grossissement pèserait des dizaines de Mo.
2. **Service worker** pour jouer hors ligne, une fois les 5 Mo d'audio en cache.
3. **Sons de jeu** : `pop.wav` est extrait mais inutilisé. L'original ne s'en
   servait pas non plus, mais un retour sonore sur un pas bloqué ou une
   rencontre serait un vrai plus.

## Journal des sessions

### Session 1 — 18/08/2026
- Analyse complète du `.sb3` : décompilation des ~1 300 blocs, extraction des
  4 grilles, identification de l'algorithme d'origine (backtracker récursif),
  inventaire des assets. Tout est consigné dans `README.md` §2.
- Arbitrages validés : déplacement case par case, audio ré-encodé et paresseux,
  bouton rejouer, sortie à distance minimale, compteur `Traveled` corrigé,
  ajout d'un générateur semé avec configuration de partie.
- Création de `README.md` et `TODO.md`.
- Démarrage de l'étape 1.

### Session 2 — 18/08/2026
- Étape 1 terminée. `tools/extract-sb3.mjs` écrit, exécuté et vérifié.
- Ajout d'un `.gitignore` (`.DS_Store`).
- Correction en cours de route : l'heuristique d'algorithme se fonde sur le taux
  d'impasses seul (le 34×34 a 2 croisements en croix mais reste un backtracker),
  et le ré-encodage audio ne force plus la stéréo (les sources mono restent mono).
- **Prochaine action :** étape 2, le moteur de rendu. Commencer par `index.html`,
  `css/style.css` et `js/maze.js`, puis afficher le niveau 1 et le comparer au
  rendu ASCII de référence ci-dessus.

### Session 3 — 18/08/2026
- Étape 2 terminée : `index.html`, `css/style.css`, `js/maze.js`, `js/assets.js`,
  `js/render.js`, `js/main.js`.
- Vérification par capture Chrome headless (l'extension navigateur n'était pas
  connectée) : `--headless --screenshot` sur un serveur `python3 -m http.server`.
  Méthode à réutiliser aux étapes suivantes.
- **Prochaine action :** étape 3, la logique de jeu. Commencer par `js/rng.js` et
  `js/input.js`, puis le déplacement case par case du héros dans `js/entities.js`.

### Session 4 — 19/08/2026
- Étape 3 terminée : `rng.js`, `input.js`, `entities.js`, `level.js`,
  `audio.js`, `screens.js`, et `main.js` réécrit en vrai point d'entrée.
- Ajout de `tools/check-rules.mjs`, contrôle permanent des règles sans navigateur.
- Écarts assumés vis-à-vis de l'original, consignés dans `README.md` §3 :
  jet de survie une fois par contact, cadences chiffrées, minotaures sans
  demi-tour immédiat et non adjacents au départ, ZQSD au lieu de WASD.
- **Prochaine action :** étape 4, le générateur. Écrire le backtracker récursif
  semé dans `js/maze.js` (`Maze.solid(n)` et `open()` existent déjà), vérifier
  qu'il retrouve ~10 % d'impasses et 0 croix comme les labyrinthes d'origine,
  puis l'écran de configuration.

### Session 5 — 19/08/2026
- Étape 4 terminée : générateurs dans `js/maze.js`, `js/config.js`, `js/ui.js`,
  surcouche HTML et feuille de style refondues, `js/main.js` recâblé.
- `tools/check-rules.mjs` étendu aux générateurs et aux 16 combinaisons de
  configuration : 51 contrôles.
- Réglage : la rampe de tailles partait trop bas (premier niveau à 6×6 en
  Moyen) ; plancher relevé à `max(8, n/2,5)`.
- **Prochaine action :** étape 5, le confort. D-pad tactile et bouton « marcher
  lentement » (la surcouche et `Stage.cssRect` sont déjà en place pour les
  poser), pause, bouton rejouer, plein écran, puis retirer ou assumer les
  raccourcis de développement `?setup` et le bandeau `#debug`.

### Session 6 — 19/08/2026
- Section « À penser : un vrai mode mobile » ajoutée en tête des étapes.
- Étape 5 terminée : `js/ui.js` refondu (panneaux, barre d'outils, D-pad),
  `input.js` ouvert aux commandes tactiles, `screens.js` doté d'un état pause,
  `render.js` doté de `verticalBias`, balisage et feuille de style refaits.
- **Prochaine action :** étape 6, la publication. `manifest.webmanifest` et
  icônes, `git init`, dépôt `Aytan-sudo/maze-for-adventurers`, GitHub Pages,
  puis `node ~/dev/python/Jeux_Pages/HUB/ajouter-jeu.mjs`.

### Session 7 — 19/08/2026
- Étape 6 terminée : icônes engendrées, manifeste, dépôt public, Pages, hub.
- Suite : scène carrée pendant les parties sur écran étroit (+34 % de
  labyrinthe), HUD reporté dans la barre du bas.
- **Prochaines pistes**, par ordre d'intérêt : essayer un 34×34 sur un vrai
  téléphone pour trancher la question de la caméra ; service worker ; retours
  sonores en jeu.

### Session 8 — 19/08/2026
- Boutons `Son` et `Pause` réparés : ils déclaraient une action que
  `runCommand` ne traitait pas. Garde-fou ajouté dans `check-rules.mjs`.
- Icône : minotaure sur labyrinthe estompé (alpha reconstruit depuis le canal
  vert, le sprite étant bicolore et opaque). Favicone 32 px : labyrinthe seul.
- Caméra et bascule « Vue d'ensemble » (touche `V`).
- D-pad nettement agrandi (plancher à 96 px, plafond 190).
- Plein écran masqué là où l'API n'existe pas (iOS) ; balises
  `apple-mobile-web-app-*` ajoutées pour l'écran d'accueil.
- **Piège outillage :** sous `--dump-dom`, Chrome ne compose presque pas et
  `requestAnimationFrame` ne tourne que ~2 fois : la boucle de jeu n'avance
  pas et tout test d'interaction échoue silencieusement. Un vrai test de clics
  demande CDP, pas `--dump-dom`.
- **Prochaine action :** essais sur Chrome connecté (tactile réel, plein écran
  iOS, confort du zoom sur un 34×34).

### Session 9 — 19/08/2026 (Chrome piloté)
Premiers essais dans un vrai navigateur. Trois défauts trouvés, trois pièges
d'outillage à ne pas réapprendre.

**Défauts corrigés :**
1. **La scène carrée mangeait la place des commandes.** En portrait elle
   occupait toute la hauteur, ne laissant plus assez de bande : les commandes
   basculaient en surimpression *par-dessus* le labyrinthe. `Stage` a désormais
   `reservedBottom`, soustrait de la hauteur **avant** de dimensionner la scène.
2. **`setPointerCapture` condamnait le D-pad entier.** Il était appelé avant
   l'enregistrement de la direction ; quand il lève — ce qui arrive sur certains
   pointeurs — le gestionnaire s'interrompait et le bouton restait inerte. La
   direction est maintenant posée en premier, la capture tentée ensuite dans un
   `try`, avec `pointerleave` en filet.
3. **Une tape sèche était perdue.** Appui et relâchement dans la même image :
   la boucle ne voyait jamais la direction. Le relâchement est différé de deux
   images.

**Pièges d'outillage :**
- **Le cache des modules ES.** `python3 -m http.server` laisse le navigateur
  réutiliser d'anciens modules : on corrige, on recharge, et c'est l'ancien code
  qui tourne. D'où `tools/serve-dev.py`, qui interdit le cache. **Toujours
  servir avec lui pendant les essais navigateur.**
- **`requestAnimationFrame` ne tourne pas dans un onglet non rendu.** Mesuré :
  0 image en 500 ms. La boucle de jeu est alors gelée et *tout* paraît cassé.
  Avant de conclure qu'un déplacement ne marche pas, vérifier que les images
  avancent (`game.timer` progresse).
- **Ne jamais tester une direction sans vérifier qu'elle n'est pas murée.**
  J'ai conclu deux fois à un bug en poussant le héros contre un mur.

**Ajouts :** `?niveau=N` saute à un niveau, `?debug` expose `window.mfa`
(`game`, `ui`, `input`, `stage`) — indispensable pour diagnostiquer depuis un
navigateur piloté, où l'on ne peut pas poser de point d'arrêt.

**Reste à faire :** essai sur un vrai téléphone (plein écran iOS, confort du
zoom au doigt), et réglage éventuel des 11 cellules visibles.
