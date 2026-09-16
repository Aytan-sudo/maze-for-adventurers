/* Interface légère partagée par les jeux raccordés. Le profil est fixé à
 * l'ouverture de l'onglet ; changer de joueur dans le hub ne réattribue jamais
 * une partie en cours. */
(function () {
    'use strict';
    const p = globalThis.Passeport;
    if (!p) return;
    function demarrer() {
        const ruban = document.querySelector('[data-passeport-ruban]');
        if (!ruban) return;
        const lien = document.createElement('a');
        const message = document.createElement('span');
        message.setAttribute('role', 'status');
        let profil;
        try { profil = p.profil(); } catch { /* avertissement ci-dessous */ }
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
        const url = new URL(local ? '/HUB/' : '/hub-gaming/', location.origin);
        if (profil) url.searchParams.set('profil', profil.id);
        lien.href = url.href;
        lien.textContent = profil ? `${profil.avatar} ${profil.nom} · Passeport` : '📒 Mon passeport';
        // Chaque jeu peut dire ce qu'il compte : « 10 mots », « 10 calculs »…
        message.textContent = p.avertissement || (profil ? ruban.dataset.consigne || 'Tampon : 10 réponses ou une partie réussie' : 'Mode invité');
        const nomDuJeu = ruban.dataset.jeu;
        if (profil && p.JEUX[nomDuJeu] && !p.avertissement) {
            try {
                const deja = p.coffre.lire(`activite/${profil.id}/${p.jourLocal()}/${nomDuJeu}`);
                if (deja) { message.textContent = '★ Ton tampon du jour est dans le carnet'; ruban.dataset.gagne = 'true'; }
            } catch { /* le coffre signale l'erreur */ }
        }
        ruban.append(lien, message);
        function erreur(texte) { message.textContent = texte; ruban.dataset.erreur = 'true'; }
        if (p.avertissement) erreur(p.avertissement);
        window.addEventListener('passeport-erreur', e => erreur(e.detail));
        window.addEventListener('passeport-tampon', e => {
            if (ruban.dataset.erreur) return;
            message.textContent = `${p.THEMES[e.detail.theme].emoji} Tampon gagné !${e.detail.pedagogique ? ' Journée validée.' : ''}`;
            ruban.dataset.gagne = 'true';
        });
        // Les pages de configuration et de scores restent dans le même profil,
        // même si un autre enfant est choisi dans un autre onglet du hub.
        for (const a of document.querySelectorAll('a[href]')) {
            const cible = new URL(a.href, location.href);
            if (cible.origin === location.origin && cible.pathname.startsWith(new URL('.', location.href).pathname)) {
                cible.searchParams.set('profil', p.profilId || '');
                a.href = cible.href;
            }
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer, { once: true });
    else demarrer();
})();
