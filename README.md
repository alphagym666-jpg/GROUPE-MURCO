# Groupe Murco Inc. — Gestion

Application de gestion d'entreprise (web + mobile) faite sur mesure pour Groupe Murco Inc.:
factures, soumissions, clients, journal de bord (km), reçus avec photos, Gmail et dossier pour le comptable.
Tout est relié ensemble.

## Ce que ça fait

| Module | Fonctionnalités |
|---|---|
| **Factures** | Numérotation automatique (F-1001…), TPS 5 % / TVQ 9,975 %, PDF avec ton logo et tes numéros de taxes, paiements partiels, statut « en retard » |
| **Soumissions** | PDF avec ligne de signature, une fois acceptée: **1 clic → facture** |
| **Journal de bord automatique** | Chaque facture avec un *lieu des travaux* ajoute le trajet **domicile → job (aller-retour)** avec la raison = la job faite. Distance routière réelle (OpenStreetMap). Export PDF/Excel conforme (date, destination, raison, km) |
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

Le fichier `.github/workflows/deploy.yml` publie l'app sur GitHub Pages à chaque mise à jour de la branche `main`.
Sur GitHub: *Settings → Pages → Source: GitHub Actions*. L'adresse sera du genre
`https://<ton-utilisateur>.github.io/GROUPE-MURCO/`.
(GitHub Pages sur un dépôt privé demande un forfait payant; sinon Netlify ou Vercel font la même chose gratuitement en important ce dépôt.)

Ensuite sur le téléphone:
- **iPhone**: Safari → Partager → « Sur l'écran d'accueil »
- **Android**: Chrome → ⋮ → « Installer l'application »

## Relier Gmail (une seule fois)

1. <https://console.cloud.google.com/> → nouveau projet « Murco ».
2. *API et services → Bibliothèque* → activer **Gmail API**.
3. *Écran de consentement OAuth* → Externe → ajoute ton adresse Gmail comme « utilisateur test ».
4. *Identifiants → Créer → ID client OAuth → Application Web*. Dans « Origines JavaScript autorisées », ajoute
   l'adresse de ton app (ex.: `https://<ton-utilisateur>.github.io` et `http://localhost:5173`).
5. Colle l'ID client dans **Paramètres → Gmail**.

Sans Gmail configuré, le bouton « Envoyer » ouvre quand même ta messagerie avec le PDF téléchargé.

## Données

Les données sont gardées **sur l'appareil** (base IndexedDB du navigateur), rien n'est envoyé à un serveur tiers
sauf: les adresses (pour le calcul des km via OpenStreetMap) et les courriels (via ton propre Gmail).
Utilise **Paramètres → Sauvegarde** régulièrement; la sauvegarde ZIP sert aussi à transférer les données
d'un appareil à l'autre.

## Technique

React + TypeScript + Vite, Dexie (IndexedDB), jsPDF, JSZip, exifr (GPS des photos),
OpenStreetMap Nominatim (adresses) + OSRM (distance routière), Google Identity Services + Gmail API.
Pour publier dans l'App Store / Play Store plus tard: envelopper avec Capacitor (`npx cap init`).
