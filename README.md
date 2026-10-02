# Groupe Murco — Gestion

**Ouvrir l'application:** <https://alphagym666-jpg.github.io/GROUPE-MURCO/>
(sur l'ordi: ouvre le lien dans Chrome/Edge et clique l'icône « Installer » dans la barre d'adresse;
sur iPhone: Safari → Partager → « Sur l'écran d'accueil »; sur Android: Chrome → ⋮ → « Installer l'application »)

Application de gestion d'entreprise (web + mobile) faite sur mesure pour Groupe Murco Inc.:
factures, soumissions, clients, journal de bord (km), reçus avec photos, Gmail et dossier pour le comptable.
Tout est relié ensemble.

## Ce que ça fait

| Module | Fonctionnalités |
|---|---|
| **Facture express** | Sur le cell, en 30 secondes: client → touche les codes → quantité → « Créer et partager » (texto, Messenger, courriel). **Dictée vocale**: « NDG 120 pieds et lavage de vitres 12 fenêtres chez Tremblay ». Payé comptant sur place avec photo de l'argent |
| **Factures et soumissions** | Codes de job (NDG, LAP, LVE…) avec prix et minimum par ligne, calculateur pi² / pi lin, rabais, dépôt (avec photo), paiements avec photo de preuve, PDF avec photos avant/après |
| **Lien client (portail)** | Le client ouvre un lien sans compte: voit sa soumission, **l'accepte et la signe au doigt**; la signature revient dans l'app et la soumission passe « Acceptée ». Pour une facture: comment payer (Interac) |
| **Agenda des jobs** | Calendrier, ordre de la journée optimisé, **route du jour dans Google Maps**, jobs récurrents (gouttières chaque automne…), rappels au client par texto/courriel, job → facture en 1 clic |
| **Journal de bord automatique** | Route de la journée domicile → jobs → domicile quand les jobs sont « Faits »; sinon aller-retour par facture. Distances Google Maps. Export PDF/Excel |
| **Photos** | Avant / après sur chaque job et facture, preuves de paiement comptant et bordereaux de dépôt, reçus de dépenses (GPS de la photo → km depuis la maison) |
| **Tableau de bord** | Jobs du jour, factures à encaisser avec **relance** en 1 clic, revenus des 12 derniers mois, ventes par code de job, soumissions vues/signées |
| **Synchronisation** | Ordi ↔ cell en temps réel (Firebase, gratuit), hors-ligne, photos incluses |
| **Dossier comptable** | ZIP: sommaire, factures PDF, reçus par catégorie, preuves de paiement, journal de bord, fichiers Excel/CSV |
| **Pro** | Recherche rapide partout (Ctrl+K), bouton + sur le cell, mode sombre, annulation après suppression, fonctionne hors-ligne |

## Démarrer

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # version de production dans dist/
```

Puis dans l'app: **Paramètres** → entre les infos de la compagnie (adresse, NEQ, TPS, TVQ, RBQ, logo) et
**l'adresse de ton domicile** (point de départ du journal de bord).

## Mettre en ligne (pour l'utiliser sur ton téléphone)

Le fichier `.github/workflows/deploy.yml` publie l'app sur GitHub Pages à chaque mise à jour.
Si la publication échoue la première fois: sur GitHub, *Settings → Pages → Source: **GitHub Actions***, puis relance le workflow
(*Actions → Déployer l'application → Run workflow*).

Ensuite sur le téléphone:
- **iPhone**: Safari → Partager → « Sur l'écran d'accueil »
- **Android**: Chrome → ⋮ → « Installer l'application »

## Synchronisation (une seule fois, ~10 min)

1. <https://console.firebase.google.com/> → **Créer un projet** « murco ».
2. **Authentication → Commencer** → active **Adresse e-mail/Mot de passe** (et Google si désiré).
3. **Authentication → Paramètres → Domaines autorisés** → ajoute `alphagym666-jpg.github.io`.
4. **Firestore Database → Créer une base** → région `northamerica-northeast1 (Montréal)`, mode production.
   Onglet **Règles**: colle le contenu de [`firestore.rules`](firestore.rules) → **Publier**
   (ces règles protègent tes données et permettent au client de seulement voir/signer sa soumission).
5. **⚙️ Paramètres du projet → Vos applications → `</>` Web** → copie le bloc `firebaseConfig`.
6. Dans l'app: **Paramètres → Synchronisation** → colle le bloc → **Créer mon compte**.
7. Pour le téléphone: copie le « lien pour connecter ton téléphone » (dans Paramètres), ouvre-le sur le téléphone, connecte-toi avec le même courriel/mot de passe.

Optionnel: mets le bloc `firebaseConfig` dans une variable de dépôt GitHub nommée `FIREBASE_CONFIG`
(*Settings → Secrets and variables → Actions → Variables*) pour qu'il soit intégré à l'app publiée.

Forfait gratuit Firebase (Spark): 1 Go de données et 50 000 lectures/jour, largement suffisant.

## Google Maps (km exacts et adresses)

1. <https://console.cloud.google.com/google/maps-apis/start> (même projet que Firebase).
2. Active: **Maps JavaScript API**, **Geocoding API**, **Routes API**, **Places API (New)**, **Maps Embed API**.
3. **Clés et identifiants → Créer une clé API** → restriction « Sites Web »: `https://alphagym666-jpg.github.io/*`.
4. Colle la clé dans **Paramètres → Google Maps** → **Tester**. La clé se synchronise sur le téléphone.

Google offre un crédit mensuel gratuit qui couvre largement l'usage d'une petite entreprise.

## Relier Gmail (une seule fois)

1. <https://console.cloud.google.com/> → nouveau projet « Murco ».
2. *API et services → Bibliothèque* → activer **Gmail API**.
3. *Écran de consentement OAuth* → Externe → ajoute ton adresse Gmail comme « utilisateur test ».
4. *Identifiants → Créer → ID client OAuth → Application Web*. Dans « Origines JavaScript autorisées », ajoute
   l'adresse de ton app (ex.: `https://<ton-utilisateur>.github.io` et `http://localhost:5173`).
5. Colle l'ID client dans **Paramètres → Gmail**.

Sans Gmail configuré, le bouton « Envoyer » ouvre quand même ta messagerie avec le PDF téléchargé.

## Données

Chaque appareil garde une copie complète (IndexedDB) et la synchronise dans **ton** projet Firebase
(seul ton compte y a accès, voir `firestore.rules`). Les adresses passent par Google Maps (ou OpenStreetMap)
pour le calcul des km, et les courriels par ton propre Gmail.
**Paramètres → Sauvegarde** permet aussi de télécharger une copie ZIP complète.

## Technique

React + TypeScript + Vite, Dexie (IndexedDB), Firebase (Auth + Firestore) pour la synchronisation,
Google Maps (Routes, Geocoding, Places, Embed) avec repli OpenStreetMap, jsPDF, JSZip, exifr (GPS des photos),
Google Identity Services + Gmail API.

Tests: `npm test` (analyse de la dictée).
Tester la synchronisation en local: `npx firebase-tools emulators:start --only auth,firestore --project demo-murco`,
puis dans Paramètres → Synchronisation, coller `{"apiKey":"x","projectId":"demo-murco","authDomain":"x","emulator":true}`.
Pour publier dans l'App Store / Play Store plus tard: envelopper avec Capacitor (`npx cap init`).
