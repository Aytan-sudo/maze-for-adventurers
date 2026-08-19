/**
 * Musiques et bruitages.
 *
 * Les quatre pistes pèsent 5 Mo à elles seules : rien n'est téléchargé avant
 * d'être joué. Les navigateurs refusent par ailleurs de démarrer un son avant
 * une action de l'utilisateur — on retient donc la piste demandée et on la
 * lance à la première touche.
 */

const MUTE_KEY = 'mfa.muted';

export class AudioPlayer {
  constructor(assets) {
    this.assets = assets;
    this.elements = new Map();
    this.current = null;
    this.pending = null;
    this.unlocked = false;
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  element(id) {
    let el = this.elements.get(id);
    if (!el) {
      el = new Audio(this.assets.audioUrl(id));
      el.preload = 'none';
      this.elements.set(id, el);
    }
    return el;
  }

  /** Musique de fond : une seule à la fois, en boucle. */
  playMusic(id, { volume = 1 } = {}) {
    if (this.current === id) return;
    this.stopMusic();
    this.current = id;
    const el = this.element(id);
    el.loop = true;
    el.volume = volume;
    el.currentTime = 0;
    this.attempt(el, id);
  }

  /** Son ponctuel : ne remplace pas la musique en cours. */
  playOnce(id, { volume = 1 } = {}) {
    const el = this.element(id);
    el.loop = false;
    el.volume = volume;
    el.currentTime = 0;
    this.attempt(el, null);
  }

  attempt(el, musicId) {
    if (this.muted) return;
    el.play().catch(() => {
      // Lecture refusée faute d'interaction : on réessaiera au déverrouillage.
      if (musicId) this.pending = musicId;
    });
  }

  stopMusic() {
    if (this.current) {
      const el = this.elements.get(this.current);
      if (el) { el.pause(); el.currentTime = 0; }
    }
    this.current = null;
    this.pending = null;
  }

  stopAll() {
    for (const el of this.elements.values()) { el.pause(); el.currentTime = 0; }
    this.current = null;
    this.pending = null;
  }

  /** À appeler à la première interaction : relance ce qui avait été refusé. */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.pending && !this.muted) {
      const id = this.pending;
      this.pending = null;
      const el = this.element(id);
      el.play().catch(() => {});
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    if (muted) {
      for (const el of this.elements.values()) el.pause();
    } else if (this.current) {
      this.element(this.current).play().catch(() => {});
    }
  }
}
