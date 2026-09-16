/* Passeport 1.8.0 — source commune, distribuée par scripts/distribuer.mjs.
 * Aucun réseau. Une entrée indépendante par profil / jeu / journée évite
 * qu'une partie dans un autre onglet écrase les tampons de son voisin.
 */
(function (global) {
    'use strict';
    const VERSION = 1;
    const RACINE = 'collection.coffre.v1';
    const PREFIXE = 'collection.v1.';
    const AVATARS = ['🦊', '🐼', '🐱', '🐸', '🐰', '🐻', '🐨', '🦄'];
    const PALETTES = ['lavande', 'peche', 'menthe'];
    // Ludique pour les enfants, sobre pour les adultes : seuls les mots et la mascotte changent.
    const TONS = ['ludique', 'sobre'];
    const THEMES = {
        geo: { nom: 'Géographie', emoji: '🌍', titre: 'À la découverte du monde' },
        nombres: { nom: 'Nombres', emoji: '🔢', titre: 'Le pouvoir des nombres' },
        mots: { nom: 'Mots', emoji: '📖', titre: 'Les mots font voyager' },
        logique: { nom: 'Logique', emoji: '🧩', titre: 'Des idées qui s’emboîtent' },
        aventure: { nom: 'Aventure', emoji: '🧭', titre: 'Le plaisir de l’aventure' }
    };
    const JEUX = {
        'geo-trouve-tout': { theme: 'geo', questions: 10, stockage: 'geo', nom: 'Géo Trouve-Tout' },
        html_multiplication: { theme: 'nombres', questions: 10, stockage: 'multiplication', nom: 'Multiplication' },
        // Dix mots acceptés par le dictionnaire dans la journée, sur plusieurs parties si besoin, ou un mot trouvé.
        sutom: { theme: 'mots', questions: 10, stockage: 'sutom', nom: 'SUTOM' },
        // Casse-tête : une grille réussie, ou l'effort compté à leur façon —
        // dix parties jouées jusqu'au bout, trente traits posés dans la journée.
        demineur: { theme: 'logique', questions: 10, stockage: 'demineur', nom: 'Démineur' },
        slitherlink: { theme: 'logique', questions: 30, stockage: 'slitherlink', nom: 'Slitherlink' },
        // Une grille terminée (tous les murs posés), ou trente murs posés dans la journée.
        architecte: { theme: 'logique', questions: 30, stockage: 'architecte', nom: 'L’Architecte' },
        // Une partie gagnée, ou cinquante coups joués dans la journée.
        solitaire: { theme: 'logique', questions: 50, stockage: 'solitaire', nom: 'Solitaire' },
        // Une grille complétée, ou vingt pièces (tesselles) posées dans la journée.
        polyominos: { theme: 'logique', questions: 20, stockage: 'polyominos', nom: 'Polyominos' },
        mosaicomino: { theme: 'logique', questions: 20, stockage: 'mosaicomino', nom: 'Mosaïcomino' },
        // L'objectif du plateau (2048 en 4×4) ou la grille du jour menée à son
        // terme, sinon cent coups glissés dans la journée — une demi-partie.
        '2048': { theme: 'nombres', questions: 100, stockage: '2048', nom: '2048' },
        // Arcade : un record battu, ou vingt fruits mangés dans la journée.
        snake: { theme: 'aventure', questions: 20, stockage: 'snake', nom: 'Snake' },
        // Une chaîne de mots trouvée, ou dix mots acceptés dans la journée.
        motamorphose: { theme: 'mots', questions: 10, stockage: 'motamorphose', nom: 'Motamorphose' },
        // Une partie gagnée, ou vingt coups joués dans la journée.
        Dames: { theme: 'logique', questions: 20, stockage: 'dames', nom: 'Dames' },
        // Le défi du jour rempli, ou vingt échanges dans la journée.
        diamants: { theme: 'logique', questions: 20, stockage: 'diamants', nom: 'Diamants' },
        // Le cristal atteint, ou vingt miroirs pivotés dans la journée.
        'laser-mirror': { theme: 'logique', questions: 20, stockage: 'lasers', nom: 'Laser & Miroirs' },
        // Une grille démêlée, ou vingt sommets déposés dans la journée.
        untangle: { theme: 'logique', questions: 20, stockage: 'untangle', nom: 'Untangle' },
        // Le trésor trouvé, ou cent cinquante mètres marchés dans la journée —
        // le compteur de cases du jeu, cumulé sur toutes les parties, morts
        // comprises. Le plus court chemin d'un petit donjon en fait 68.
        'maze-for-adventurers': { theme: 'aventure', questions: 150, stockage: 'maze', nom: 'Maze for Adventurers' }
    };
    const ESPACES = Object.values(JEUX).map(j => j.stockage);
    // Les clés que chaque jeu écrit en mode invité, rangées par espace : c'est
    // ce que `reprendreAncien` recopie dans un profil. Le séparateur est '.'
    // ou ':' selon les jeux — leur convention, pas la nôtre : on les nomme donc
    // en clair plutôt que de deviner l'espace à partir d'un préfixe.
    const ANCIENNES_CLES = {
        geo: ['geo.preferences', 'geo.memoire', 'geo.stats', 'geo.partie'],
        multiplication: ['gameConfig', 'highscores'],
        sutom: ['sutom.stats', 'sutom.daily', 'sutom.settings', 'sutom.recent', 'sutom.help-seen', 'sutom.game'],
        demineur: ['demineur.preferences', 'demineur.records', 'demineur.stats'],
        slitherlink: ['slitherlink.serie', 'slitherlink.partie'],
        architecte: ['architecte.preferences', 'architecte.partie', 'architecte.records', 'architecte.stats'],
        solitaire: ['solitaire.preferences', 'solitaire.stats', 'solitaire.stats.ouvert', 'solitaire.partie'],
        polyominos: ['polyominos.preferences', 'polyominos.session', 'polyominos.statistiques'],
        mosaicomino: ['mosaicomino.preferences', 'mosaicomino.session', 'mosaicomino.statistiques'],
        '2048': ['2048.preferences', '2048.records', '2048.partie', '2048.defi'],
        snake: ['snake.preferences', 'snake.records', 'snake.history', 'snake.session'],
        motamorphose: ['motamorphose:v1', 'motamorphose:longueur', 'motamorphose:theme'],
        dames: ['dames.preferences', 'dames.stats', 'dames.partie'],
        diamants: ['diamants:reglages', 'diamants:mode', 'diamants:stats', 'diamants:jour', 'diamants:libre'],
        lasers: ['laser-mirror:difficulty', 'laser-mirror:sounds', 'laser-mirror:vibration',
            'laser-mirror:theme', 'laser-mirror:stats', 'laser-mirror:current-game'],
        untangle: ['untangle.preferences', 'untangle.partie', 'untangle.statistiques'],
        // Maze ne retient qu'une chose : le son coupé ou non ('1' ou '0').
        maze: ['mfa.muted']
    };
    const ESPACE_DE_CLE = new Map(Object.entries(ANCIENNES_CLES)
        .flatMap(([espace, cles]) => cles.map(c => [c, espace])));
    // Un jeu raccordé après le dernier réglage d'un profil y entre d'office.
    // `jeuxVus` retient les jeux que l'administrateur a pu cocher ou décocher ;
    // un profil plus ancien que ce champ n'a connu que les deux premiers jeux.
    const JEUX_INITIAUX = ['geo-trouve-tout', 'html_multiplication'];
    function activitesDe(p) {
        const vus = new Set(Array.isArray(p.jeuxVus) ? p.jeuxVus : [...JEUX_INITIAUX, ...p.activites]);
        return [...new Set([...p.activites, ...Object.keys(JEUX).filter(j => !vus.has(j))])];
    }
    const idValide = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(x);
    // Chaque jeu embarque sa propre copie du module : une copie plus ancienne
    // doit lire, conserver et exporter les jeux raccordés après elle.
    const jeuValide = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(x);
    const nomValide = x => typeof x === 'string' && /^[a-z0-9_-]{1,32}$/.test(x);
    const objet = x => x !== null && typeof x === 'object' && !Array.isArray(x);
    const jourLocal = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    function numeroJour(iso) {
        if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
        const [a, m, j] = iso.split('-').map(Number);
        const date = new Date(Date.UTC(a, m - 1, j));
        return date.toISOString().slice(0, 10) === iso ? date.getTime() / 86400000 : NaN;
    }
    const dateDuNumero = n => new Date(n * 86400000).toISOString().slice(0, 10);
    function verifier(cle, valeur) {
        if (valeur === null) return true; // tombstone : un effacement ne ressuscite pas le secours
        if (cle === 'actif') return valeur === '' || idValide(valeur);
        const parts = cle.split('/');
        if (parts[0] === 'profil' && parts.length === 2) {
            return idValide(parts[1]) && objet(valeur) && valeur.id === parts[1]
                && typeof valeur.nom === 'string' && valeur.nom.trim().length >= 1 && valeur.nom.length <= 24
                && !/[\u0000-\u001f\u007f]/.test(valeur.nom)
                && AVATARS.includes(valeur.avatar) && PALETTES.includes(valeur.palette)
                && Number.isInteger(valeur.objectif) && valeur.objectif >= 2 && valeur.objectif <= 7
                && Array.isArray(valeur.activites) && valeur.activites.length >= 1
                && valeur.activites.every(jeuValide)
                && typeof valeur.archive === 'boolean' && Number.isFinite(numeroJour(valeur.creeLe))
                // Champs facultatifs (1.3.0) : une copie plus ancienne les ignore sans rejeter le profil.
                // L'objectif garde toujours un nombre valide, même quand il est désactivé.
                && (valeur.ton === undefined || TONS.includes(valeur.ton))
                && (valeur.sansObjectif === undefined || typeof valeur.sansObjectif === 'boolean')
                && (valeur.jeuxVus === undefined || (Array.isArray(valeur.jeuxVus) && valeur.jeuxVus.every(jeuValide)));
        }
        if (parts[0] === 'activite' && parts.length === 4) {
            return idValide(parts[1]) && Number.isFinite(numeroJour(parts[2])) && jeuValide(parts[3])
                && objet(valeur) && valeur.profil === parts[1] && valeur.jour === parts[2] && valeur.jeu === parts[3]
                && nomValide(valeur.theme) && (!Object.hasOwn(JEUX, parts[3]) || valeur.theme === JEUX[parts[3]].theme)
                && typeof valeur.pedagogique === 'boolean';
        }
        if (parts[0] === 'jeu' && parts.length === 4) {
            if (!idValide(parts[1]) || !nomValide(parts[2])
                || !/^[a-zA-Z0-9_.%~-]{1,240}$/.test(parts[3]) || typeof valeur !== 'string' || valeur.length > 500000) return false;
            // Tout JSON valide : un jeu range aussi des drapeaux (« true ») ou des nombres.
            try { JSON.parse(valeur); return true; } catch { return false; }
        }
        return false;
    }
    function creerCoffre({ stockage, maintenant = () => new Date(), uuid = () => global.crypto.randomUUID(), signaler = () => {} }) {
        const alertes = new Set();
        const signal = message => { alertes.add(message); signaler(message); };
        const erreur = message => { signal(message); return new Error(message); };
        // Le repère « .secours » copie le coffre courant ; « .precedent » garde
        // celui d'avant la dernière restauration. La version 1.0.0 rangeait ce
        // dernier dans « .secours » : un repère abîmé ramenait alors en silence
        // aux données d'avant l'import. On remet les deux à leur place.
        try {
            const id = stockage.getItem(RACINE), copie = stockage.getItem(RACINE + '.secours');
            if (idValide(id) && copie !== id) {
                if (idValide(copie)) stockage.setItem(RACINE + '.precedent', copie);
                stockage.setItem(RACINE + '.secours', id);
            }
        } catch { /* réessayé au prochain chargement */ }
        function generation() {
            const id = stockage.getItem(RACINE);
            if (idValide(id)) return id;
            const copie = stockage.getItem(RACINE + '.secours');
            if (!id && (!copie || copie === 'principal')) return 'principal';
            if (idValide(copie)) { signal('Le repère du coffre a été récupéré depuis sa copie. Exporte une sauvegarde.'); return copie; }
            throw erreur('Le coffre est illisible. Restaure une sauvegarde avant de créer un profil.');
        }
        const adresse = (cle, gen = generation()) => `${PREFIXE}${gen}.${cle}`;
        function decoder(brut, cle) {
            const contenu = JSON.parse(brut);
            if (!objet(contenu) || contenu.v !== VERSION || !Object.hasOwn(contenu, 'valeur') || !verifier(cle, contenu.valeur)) throw new Error('Format incompatible');
            return contenu.valeur;
        }
        function lire(cle) {
            const base = adresse(cle);
            const brut = stockage.getItem(base);
            if (brut !== null) {
                let format;
                try { format = JSON.parse(brut); } catch { /* la copie de secours peut réparer le JSON */ }
                if (format?.v > VERSION) throw erreur('Ces données viennent d’une version plus récente. Actualise le jeu avant de continuer.');
                try { return decoder(brut, cle); } catch { /* essayer la dernière copie valide */ }
            }
            const secours = stockage.getItem(base + '.secours');
            if (secours !== null) {
                try {
                    const valeur = decoder(secours, cle);
                    signal('Une donnée a été récupérée depuis sa copie de secours. Exporte une sauvegarde.');
                    return valeur;
                } catch { /* ne jamais remplacer des données inconnues par un profil vide */ }
            }
            if (brut !== null || secours !== null) throw erreur('Des données sont illisibles ou viennent d’une version plus récente. Restaure une sauvegarde compatible.');
            return null;
        }
        function ecrire(cle, valeur) {
            if (!verifier(cle, valeur)) throw new Error('Donnée de passeport invalide.');
            const base = adresse(cle);
            const avant = lire(cle);
            const brut = JSON.stringify({ v: VERSION, valeur });
            try {
                if (avant !== null) stockage.setItem(base + '.secours', JSON.stringify({ v: VERSION, valeur: avant }));
                stockage.setItem(base, brut);
                if (stockage.getItem(base) !== brut) throw new Error('Vérification impossible');
            } catch { throw erreur('Enregistrement impossible : le stockage est plein ou refusé. Exporte tes données avant de fermer cette page.'); }
            if (avant === null) {
                try { stockage.setItem(base + '.secours', brut); }
                catch { signal('Donnée enregistrée, mais sa copie locale de secours n’a pas pu être créée. Exporte une sauvegarde.'); }
            }
            return valeur;
        }
        function cles() {
            const prefixe = `${PREFIXE}${generation()}.`;
            const noms = new Set();
            for (let i = 0; i < stockage.length; i++) {
                const k = stockage.key(i);
                if (k?.startsWith(prefixe)) noms.add(k.slice(prefixe.length).replace(/\.secours$/, ''));
            }
            return [...noms];
        }
        // Pour les listes : une entrée abîmée est signalée par lire() puis mise
        // de côté, sans priver les autres enfants de leur passeport.
        function lireOuIgnorer(cle) {
            try { return lire(cle); } catch { return undefined; }
        }
        const profils = (archives = false) => cles().filter(k => k.startsWith('profil/')).map(lireOuIgnorer)
            .filter(p => p && (archives || !p.archive)).sort((a, b) => a.creeLe.localeCompare(b.creeLe) || a.nom.localeCompare(b.nom, 'fr'));
        const profil = id => idValide(id) ? lire(`profil/${id}`) : null;
        function modifierProfil(id, changements) {
            const avant = profil(id);
            if (!avant) throw new Error('Ce profil n’existe pas sur cet appareil.');
            const p = { ...avant };
            for (const k of ['nom', 'avatar', 'palette', 'objectif', 'activites', 'archive', 'ton', 'sansObjectif', 'jeuxVus']) if (Object.hasOwn(changements, k)) p[k] = changements[k];
            p.nom = p.nom.trim();
            return ecrire(`profil/${id}`, p);
        }
        function creerProfil({ nom, avatar = '🦊', palette = 'lavande', ton = 'ludique' }) {
            if (profils(true).length >= 20) throw new Error('Ce coffre contient déjà 20 profils.');
            const id = uuid();
            const p = { id, nom: nom.trim(), avatar, palette, ton, objectif: 4, activites: Object.keys(JEUX), jeuxVus: Object.keys(JEUX), archive: false, creeLe: jourLocal(maintenant()) };
            ecrire(`profil/${id}`, p);
            ecrire('actif', id);
            return p;
        }
        function choisir(id) {
            if (id && (!profil(id) || profil(id).archive)) throw new Error('Profil indisponible.');
            ecrire('actif', id);
        }
        // Le tampon récompense l'effort OU la réussite : dix réponses essayées
        // (les erreurs comptent), ou une partie réussie, même du premier coup.
        // Chaque jeu dit ce qu'est une réussite ; `reussite` doit valoir true.
        function noter({ profilId, jeu, questions, reussite = false }) {
            const p = profil(profilId);
            if (!p || p.archive || !Object.hasOwn(JEUX, jeu)) return { gagne: false };
            const effort = Number.isInteger(questions) && questions >= JEUX[jeu].questions;
            if (!effort && reussite !== true) return { gagne: false };
            const jour = jourLocal(maintenant());
            const cle = `activite/${profilId}/${jour}/${jeu}`;
            const avant = lire(cle);
            if (avant) return { gagne: false, deja: true, activite: avant };
            const activite = { profil: profilId, jour, jeu, theme: JEUX[jeu].theme, pedagogique: activitesDe(p).includes(jeu) };
            ecrire(cle, activite);
            return { gagne: true, activite };
        }
        function bilan(id, aujourdHui = jourLocal(maintenant())) {
            const p = profil(id);
            const n = numeroJour(aujourdHui);
            if (!p || !Number.isFinite(n)) throw new Error('Profil ou date indisponible.');
            const lundi = n - ((new Date(n * 86400000).getUTCDay() + 6) % 7);
            const activites = cles().filter(k => k.startsWith(`activite/${id}/`)).map(lireOuIgnorer).filter(Boolean);
            const jours = new Set(activites.filter(a => a.pedagogique && a.jour <= aujourdHui).map(a => a.jour));
            const semaine = Array.from({ length: 7 }, (_, i) => { const jour = dateDuNumero(lundi + i); return { jour, valide: jours.has(jour), aujourdHui: jour === aujourdHui }; });
            const themes = Object.fromEntries(Object.keys(THEMES).map(t => {
                const vus = new Map();
                for (const a of activites.filter(a => a.theme === t && a.jour <= aujourdHui).sort((a, b) => b.jour.localeCompare(a.jour))) if (!vus.has(a.jour)) vus.set(a.jour, a);
                return [t, [...vus.values()]];
            }));
            return { profil: p, semaine, joursSemaine: semaine.filter(j => j.valide).length, joursTotal: jours.size, themes, objectifAtteint: !p.sansObjectif && semaine.filter(j => j.valide).length >= p.objectif };
        }
        // L'export sert surtout quand quelque chose s'est abîmé : il emporte tout
        // ce qui reste lisible et nomme ce qu'il a dû laisser.
        function preparerExport() {
            const donnees = {};
            const ignorees = [];
            for (const k of cles()) {
                const valeur = lireOuIgnorer(k);
                if (valeur === undefined) ignorees.push(k); else donnees[k] = valeur;
            }
            // Le fichier doit rester restaurable : l'import refuse une progression sans son profil.
            const ids = new Set(Object.keys(donnees).filter(k => k.startsWith('profil/') && donnees[k]).map(k => donnees[k].id));
            if (!ids.size) throw new Error(ignorees.length ? 'Aucun passeport lisible à exporter.' : 'Aucun passeport à exporter pour le moment.');
            for (const k of Object.keys(donnees)) {
                if (/^(activite|jeu)\//.test(k) && donnees[k] !== null && !ids.has(k.split('/')[1])) { delete donnees[k]; ignorees.push(k); }
            }
            if (donnees.actif && !ids.has(donnees.actif)) donnees.actif = '';
            const texte = JSON.stringify({ format: 'jeux-aymeric-passeport', version: VERSION, exporteLe: maintenant().toISOString(), donnees }, null, 2);
            return { texte, ignorees };
        }
        const exporter = () => preparerExport().texte;
        function preparerImport(texte) {
            if (typeof texte !== 'string' || texte.length > 4000000) throw new Error('Le fichier dépasse la taille autorisée (4 Mo).');
            let fichier;
            try { fichier = JSON.parse(texte); } catch { throw new Error('Ce fichier n’est pas une sauvegarde JSON lisible.'); }
            if (!objet(fichier) || fichier.format !== 'jeux-aymeric-passeport' || fichier.version !== VERSION || !objet(fichier.donnees)) throw new Error('Format de sauvegarde inconnu ou version incompatible.');
            const entrees = Object.entries(fichier.donnees);
            if (entrees.length > 20000 || entrees.some(([k, v]) => !verifier(k, v) || !/^(actif|profil\/[a-zA-Z0-9_-]+|activite\/[a-zA-Z0-9_/-]+|jeu\/[a-zA-Z0-9_.%~/-]+)$/.test(k))) throw new Error('La sauvegarde contient des données invalides.');
            const ps = entrees.filter(([k, v]) => k.startsWith('profil/') && v).map(([, v]) => v);
            if (!ps.length || ps.length > 20) throw new Error('La sauvegarde doit contenir entre 1 et 20 profils.');
            const ids = new Set(ps.map(p => p.id));
            for (const [k, v] of entrees) if (v !== null && (k.startsWith('activite/') || k.startsWith('jeu/')) && !ids.has(k.split('/')[1])) throw new Error('Une progression ne correspond à aucun profil.');
            if (fichier.donnees.actif && !ids.has(fichier.donnees.actif)) throw new Error('Le profil actif manque dans cette sauvegarde.');
            return { texte, profils: ps, tampons: entrees.filter(([k, v]) => k.startsWith('activite/') && v).length, exporteLe: fichier.exporteLe };
        }
        function restaurer(texte) {
            preparerImport(texte); // revalider au dernier instant, avant toute écriture
            const donnees = JSON.parse(texte).donnees;
            // Un repère illisible ne dit pas quel coffre était le bon : on n'efface alors rien.
            const repereSain = idValide(stockage.getItem(RACINE)) || stockage.getItem(RACINE) === null;
            let avant;
            try { avant = generation(); } catch { avant = 'principal'; }
            const suivant = uuid();
            const nouvellesCles = [];
            try {
                for (const [cle, valeur] of Object.entries(donnees)) {
                    const k = adresse(cle, suivant);
                    nouvellesCles.push(k);
                    const brut = JSON.stringify({ v: VERSION, valeur });
                    stockage.setItem(k, brut);
                    if (stockage.getItem(k) !== brut) throw new Error('Copie incomplète');
                    nouvellesCles.push(k + '.secours');
                    stockage.setItem(k + '.secours', brut);
                }
                stockage.setItem(RACINE + '.precedent', avant);
                // Bascule atomique : les anciennes données restent intactes.
                stockage.setItem(RACINE, suivant);
            } catch {
                for (const k of nouvellesCles) try { stockage.removeItem(k); } catch { /* anciennes données conservées */ }
                throw erreur('Restauration impossible, probablement par manque de place. Le coffre actuel est conservé.');
            }
            try { stockage.setItem(RACINE + '.secours', suivant); }
            catch { signal('Sauvegarde restaurée, mais la copie du repère du coffre n’a pas pu être écrite. Exporte une sauvegarde.'); }
            if (!repereSain) return suivant;
            // Ne garder qu'un coffre précédent : les restaurations répétées ne
            // doivent pas saturer le stockage. Aucune donnée de jeu extérieur
            // au passeport n'est touchée.
            const anciennes = [];
            for (let i = 0; i < stockage.length; i++) {
                const k = stockage.key(i);
                const gen = k?.startsWith(PREFIXE) ? k.slice(PREFIXE.length).split('.')[0] : null;
                if (gen && gen !== avant && gen !== suivant) anciennes.push(k);
            }
            for (const k of anciennes) try { stockage.removeItem(k); } catch { /* l'import est déjà validé */ }
            return suivant;
        }
        function stockageJeu(jeu, id) {
            if (!profil(id) || profil(id).archive || !ESPACES.includes(jeu)) return null;
            const gen = generation();
            const temporaire = new Map();
            const cle = k => `jeu/${id}/${jeu}/${encodeURIComponent(k)}`;
            function verifierContexte() {
                if (generation() !== gen || !profil(id) || profil(id).archive) throw erreur('Le passeport a changé. Rouvre le jeu depuis le hub pour enregistrer ta progression.');
            }
            return {
                getItem(k) { try { return temporaire.has(k) ? temporaire.get(k) : lire(cle(k)); } catch { return null; } },
                setItem(k, valeur) {
                    try { verifierContexte(); ecrire(cle(k), String(valeur)); temporaire.delete(k); }
                    catch (e) { temporaire.set(k, String(valeur)); throw e; }
                },
                removeItem(k) { verifierContexte(); ecrire(cle(k), null); temporaire.delete(k); }
            };
        }
        function reprendreAncien(id) {
            if (!profil(id)) throw new Error('Profil inconnu.');
            // Les palmarès de Multiplication portent le prénom du joueur dans
            // la clé ; ils se reconnaissent au préfixe, pas à la liste.
            const prefixeStats = `stats:${profil(id).nom}:`;
            const anciens = [];
            for (let i = 0; i < stockage.length; i++) {
                const k = stockage.key(i);
                if (ESPACE_DE_CLE.has(k) || k?.startsWith(prefixeStats)) anciens.push(k);
            }
            let copies = 0;
            for (const k of anciens) {
                const jeu = ESPACE_DE_CLE.get(k) ?? 'multiplication';
                let cible = k;
                if (k.startsWith('stats:')) cible = k.replace(prefixeStats, 'stats:profil:');
                const cle = `jeu/${id}/${jeu}/${encodeURIComponent(cible)}`;
                const valeur = stockage.getItem(k);
                if (lire(cle) === null && verifier(cle, valeur)) { ecrire(cle, valeur); copies++; }
            }
            return copies;
        }
        return { lire, ecrire, cles, profils, profil, creerProfil, modifierProfil, choisir, noter, bilan, exporter, preparerExport, preparerImport, restaurer, stockageJeu, reprendreAncien, generation, alertes };
    }
    const constantes = { VERSION, AVATARS, PALETTES, TONS, THEMES, JEUX, activitesDe, jourLocal, numeroJour, creerCoffre };
    if (typeof module !== 'undefined' && module.exports) module.exports = constantes;
    global.Passeport = constantes;
    if (!global.document) return;
    let coffre;
    let avertissement = '';
    const signaler = message => {
        avertissement = message;
        global.dispatchEvent(new CustomEvent('passeport-erreur', { detail: message }));
    };
    try {
        coffre = creerCoffre({ stockage: global.localStorage, signaler });
        coffre.generation();
    } catch { signaler('Le stockage local est indisponible. Les jeux restent accessibles, mais le passeport ne peut pas être enregistré.'); }
    let profilId = null;
    const url = new URL(global.location.href);
    try {
        const demande = url.searchParams.get('profil');
        const candidat = demande !== null ? demande : coffre?.lire('actif');
        const p = coffre?.profil(candidat);
        if (p && !p.archive) profilId = p.id;
        else if (demande) signaler('Ce profil n’est pas présent ici. Ouvre le hub dans le même navigateur ou restaure sa sauvegarde.');
    } catch { /* le message du coffre est déjà présenté */ }
    let generationDepart;
    try { generationDepart = coffre?.generation(); } catch { /* coffre illisible : les jeux restent accessibles */ }
    Object.assign(global.Passeport, {
        coffre, profilId, get avertissement() { return avertissement; },
        profil: () => coffre?.profil(profilId),
        stockageJeu: jeu => coffre?.stockageJeu(jeu, profilId),
        // noter(jeu, nombreDeReponses) après chaque réponse ; noter(jeu, n, true) quand une partie est réussie.
        noter(jeu, questions, reussite = false) {
            try {
                if (coffre?.generation() !== generationDepart) throw new Error('Le coffre a été restauré. Rouvre ce jeu depuis le hub.');
                const resultat = coffre?.noter({ profilId, jeu, questions, reussite });
                if (resultat?.gagne) global.dispatchEvent(new CustomEvent('passeport-tampon', { detail: resultat.activite }));
                return resultat;
            } catch (e) { signaler(e.message); return { gagne: false, erreur: true }; }
        }
    });
    Object.defineProperty(global.Passeport, 'avertissement', { get: () => avertissement });
})(globalThis);
