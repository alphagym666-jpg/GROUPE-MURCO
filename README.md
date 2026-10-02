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
| **Factures** | Numérotation automatique (F-1001…), PDF avec ton logo, rabais, dépôt, paiements partiels, statut « en retard », TPS/TVQ seulement si tu es inscrit |
| **Codes de job** | Tape `NDG`, `LAP`, `LVE`… → le service, l'unité, le prix et le **minimum par ligne** s'affichent. Liste de prix modifiable (page « Codes et prix »). **Calculateur pi² / pi lin** intégré à chaque ligne |
| **Soumissions** | PDF avec ligne de signature, une fois acceptée: **1 clic → facture** |
| **Journal de bord automatique** | Chaque facture avec un *lieu des travaux* ajoute le trajet **domicile → job (aller-retour)** avec la raison = la job faite. **Distance calculée par Google Maps** (avec carte du trajet et bouton « Ouvrir dans Google Maps »), sinon OpenStreetMap. Export PDF/Excel conforme (date, destination, raison, km) |
| **Synchronisation** | Ordi ↔ téléphone en temps réel (Firebase, gratuit). Fonctionne hors-ligne; tout se met à jour au retour du réseau. Photos des reçus incluses |
| **Reçus et dépenses** | Photo du reçu avec la caméra du téléphone. La **position GPS de la photo** (ou ta position actuelle, ou une adresse) sert à calculer **combien de km de chez toi** (ex.: le plein d'essence) et l'ajoute au journal. TPS/TVQ calculées depuis le total |
| **Clients** | Fiche avec toutes ses factures, soumissions, déplacements, dépenses et courriels Gmail |
| **Gmail** | Envoi des factures/soumissions en PDF directement de ton Gmail, lecture des courriels des clients, **import des pièces jointes (factures fournisseurs) comme reçus** |
| **Dossier comptable** | Un clic: ZIP avec sommaire (ventes, TPS/TVQ à remettre, dépenses par catégorie, km), toutes les factures PDF, les reçus classés par catégorie, le journal de bord, et fichiers Excel/CSV. Téléchargement ou envoi direct au comptable par Gmail |
| **Mobile** | S'installe comme une application (iPhone/Android), fonctionne hors-ligne |

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
   Onglet **Règles**: colle le contenu de [`firestore.rules`](firestore.rules) → **Publier**.
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

Tester la synchronisation en local: `npx firebase-tools emulators:start --only auth,firestore --project demo-murco`,
puis dans Paramètres → Synchronisation, coller `{"apiKey":"x","projectId":"demo-murco","authDomain":"x","emulator":true}`.
Pour publier dans l'App Store / Play Store plus tard: envelopper avec Capacitor (`npx cap init`).
