/**
 * Chargement des assets produits par `tools/extract-sb3.mjs`.
 *
 * Les noms de fichiers viennent du manifeste, jamais d'une convention devinée :
 * le script d'extraction garde pour chaque image le format le plus léger, si
 * bien que `minotaur` est en PNG quand tout le reste est en WebP.
 */

const BASE = 'assets/';

/** Sons chargés au moment où on en a besoin (étape 3) : ~5 Mo au total. */
export class Assets {
  constructor(manifest, images) {
    this.manifest = manifest;
    this.images = images;
  }

  img(id) {
    const image = this.images[id];
    if (!image) throw new Error(`image inconnue : ${id}`);
    return image;
  }

  /** Chemin d'un son, pour un chargement différé. */
  audioUrl(id) {
    const meta = this.manifest.audio[id];
    if (!meta) throw new Error(`son inconnu : ${id}`);
    return BASE + meta.file;
  }
}

export async function loadAssets() {
  const res = await fetch(BASE + 'data/assets.json');
  if (!res.ok) throw new Error(`chargement du manifeste : ${res.status}`);
  const manifest = await res.json();

  const images = {};
  await Promise.all(Object.entries(manifest.images).map(async ([id, meta]) => {
    const image = new Image();
    image.src = BASE + meta.file;
    // decode() attend le décodage complet : au premier dessin, plus rien ne
    // manque et aucune image n'apparaît en retard.
    await image.decode();
    images[id] = image;
  }));

  return new Assets(manifest, images);
}
