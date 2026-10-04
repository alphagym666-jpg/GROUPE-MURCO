import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OPERATOR, PRODUCT } from '../brand';
import { setLang, useLang } from '../lib/i18n';

const UPDATED = '2026-10-04';

type Section = [string, string[]];

function privacyFr(): Section[] {
  const n = PRODUCT.name;
  return [
    ['Qui sommes-nous', [
      `${n} est un logiciel de gestion pour entrepreneurs exploité par ${OPERATOR.legalName} (${OPERATOR.tradeName}), ${OPERATOR.address}.`,
      `Responsable de la protection des renseignements personnels: ${OPERATOR.privacyOfficer}, ${OPERATOR.email}, ${OPERATOR.phone}.`,
    ]],
    ['Renseignements recueillis', [
      'Ton compte: nom, courriel, mot de passe (géré par Google Firebase, jamais visible par nous) et date de création.',
      'Les données que tu entres pour gérer ton entreprise: informations de l’entreprise, clients (nom, coordonnées, adresse), soumissions, factures, paiements, reçus et leurs photos, journal de bord (km et adresses), agenda, photos de travaux, membres de ton équipe et leurs pointages (heures et positions GPS au début et à la fin d’un quart).',
      'Position: seulement quand tu utilises une fonction qui la demande (pointage, « je suis sur place », trajet), avec la permission de ton appareil.',
      'Abonnement: le paiement est traité par Stripe; nous ne voyons ni ne conservons ton numéro de carte.',
    ]],
    ['Pourquoi nous les utilisons', [
      'Fournir le service: produire tes documents, synchroniser tes appareils, calculer tes km, taxes et rapports.',
      'Gérer ton compte et ton abonnement, te contacter au sujet du service (sécurité, facturation, changements importants).',
      'Nous ne vendons aucun renseignement et ne faisons aucune publicité ciblée. Aucune décision n’est prise de façon automatisée à ton sujet.',
    ]],
    ['Les renseignements de tes clients', [
      `Pour les renseignements de tes propres clients et employés, c’est ton entreprise qui est responsable au sens de la Loi 25; ${n} agit comme fournisseur de services et ne les utilise que pour te fournir le service.`,
      'Le formulaire de demande en ligne et le lien client n’affichent que ce qui est nécessaire (soumission ou facture, coordonnées de ton entreprise).',
    ]],
    ['Où sont hébergées les données', [
      'Sur Google Cloud (Firebase), avec chiffrement en transit et au repos. Les serveurs peuvent être situés à l’extérieur du Québec; une évaluation des facteurs relatifs à la vie privée a été faite avant cette communication, et le fournisseur est tenu par contrat à une protection adéquate.',
      'Fournisseurs utilisés: Google Firebase (comptes, base de données), Stripe (paiements par carte), Google Maps ou OpenStreetMap (adresses et distances: seules les adresses à calculer sont envoyées), Open-Meteo (météo: position approximative de ton domicile), Gmail (si tu connectes ton compte pour envoyer tes courriels).',
      'La lecture des reçus (texte sur la photo) se fait sur ton appareil: la photo n’est pas envoyée à un service de lecture.',
    ]],
    ['Conservation', [
      'Tant que ton compte existe. Si tu supprimes ton compte, tes données sont effacées de nos serveurs immédiatement, et des copies de sauvegarde techniques disparaissent au plus tard dans les 30 jours.',
      'Les lois fiscales t’obligent à conserver tes registres 6 ans: exporte-les avant de supprimer ton compte (Paramètres → Mes données).',
    ]],
    ['Tes droits', [
      'Accès et portabilité: Paramètres → Mes données → « Exporter toutes mes données » (fichier structuré et photos).',
      'Rectification: tu peux modifier toutes tes données directement dans l’app.',
      'Suppression: Paramètres → Mes données → « Supprimer mon compte ». Pour un client précis: fiche du client → « Supprimer le client et ses données ».',
      'Retrait du consentement et plaintes: écris à notre responsable. Tu peux aussi t’adresser à la Commission d’accès à l’information du Québec.',
    ]],
    ['Sécurité et incidents', [
      'Accès protégé par mot de passe, règles d’accès par entreprise et par rôle (propriétaire, employé, vendeur), liens clients impossibles à deviner.',
      'Tout incident de confidentialité est consigné dans un registre; s’il présente un risque de préjudice sérieux, nous avisons les personnes concernées et la Commission d’accès à l’information.',
    ]],
    ['Stockage sur ton appareil', [
      `${n} garde une copie de tes données sur ton appareil pour fonctionner sans réseau. Nous n’utilisons aucun témoin (cookie) publicitaire ni outil de suivi.`,
    ]],
    ['Modifications', [`Dernière mise à jour: ${UPDATED}. En cas de changement important, nous t’avisons dans l’app ou par courriel.`]],
  ];
}

function privacyEn(): Section[] {
  const n = PRODUCT.name;
  return [
    ['Who we are', [
      `${n} is business management software for contractors operated by ${OPERATOR.legalName} (${OPERATOR.tradeName}), ${OPERATOR.address}.`,
      `Person in charge of the protection of personal information: ${OPERATOR.privacyOfficer}, ${OPERATOR.email}, ${OPERATOR.phone}.`,
    ]],
    ['Information we collect', [
      'Your account: name, email, password (managed by Google Firebase, never visible to us) and creation date.',
      'Data you enter to run your business: company details, clients (name, contact details, address), quotes, invoices, payments, receipts and their photos, mileage log (km and addresses), schedule, job photos, crew members and their time punches (hours and GPS position at start and end of a shift).',
      'Location: only when you use a feature that asks for it (time clock, “I’m on site”, trips), with your device’s permission.',
      'Subscription: payments are processed by Stripe; we never see or store your card number.',
    ]],
    ['Why we use it', [
      'To provide the service: produce your documents, sync your devices, calculate mileage, taxes and reports.',
      'To manage your account and subscription and contact you about the service (security, billing, important changes).',
      'We do not sell any information and do no targeted advertising. No automated decision is made about you.',
    ]],
    ['Your clients’ information', [
      `For your own clients’ and employees’ information, your business is the party responsible under Québec’s Law 25; ${n} acts as a service provider and only uses it to provide the service to you.`,
    ]],
    ['Where data is hosted', [
      'On Google Cloud (Firebase), encrypted in transit and at rest. Servers may be located outside Québec; a privacy impact assessment was carried out and the provider is contractually bound to adequate protection.',
      'Providers: Google Firebase (accounts, database), Stripe (card payments), Google Maps or OpenStreetMap (addresses and distances), Open-Meteo (weather: approximate location of your home base), Gmail (if you connect it to send your emails).',
      'Receipt reading happens on your device: the photo is not sent to a recognition service.',
    ]],
    ['Retention', [
      'For as long as your account exists. If you delete your account, your data is erased from our servers immediately; technical backup copies expire within 30 days.',
      'Tax laws require you to keep your records for 6 years: export them before deleting your account (Settings → My data).',
    ]],
    ['Your rights', [
      'Access and portability: Settings → My data → “Export all my data”.',
      'Correction: edit any of your data directly in the app.',
      'Deletion: Settings → My data → “Delete my account”. For one client: client page → “Delete client and their data”.',
      'Withdrawal of consent and complaints: write to our privacy officer. You may also contact the Commission d’accès à l’information du Québec.',
    ]],
    ['Security and incidents', [
      'Password-protected access, per-company and per-role access rules, unguessable client links. Confidentiality incidents are recorded in a register and, when there is a risk of serious injury, reported to the people concerned and to the Commission.',
    ]],
    ['Changes', [`Last updated: ${UPDATED}.`]],
  ];
}

function termsFr(): Section[] {
  const n = PRODUCT.name;
  return [
    ['Le service', [`${n} est un logiciel en ligne de gestion (soumissions, factures, agenda, équipe, dépenses, km) offert par ${OPERATOR.legalName}. En créant un compte, tu acceptes les présentes conditions.`]],
    ['Ton compte', ['Tu es responsable de ton mot de passe et des accès que tu donnes à ton équipe. Avise-nous sans délai de toute utilisation non autorisée.']],
    ['Essai et abonnement', [
      `Essai gratuit de ${PRODUCT.trialDays} jours, sans carte de crédit. Ensuite, l’abonnement est mensuel, payable d’avance, taxes en sus, et se renouvelle automatiquement.`,
      'Tu peux annuler en tout temps dans l’app (Abonnement → Gérer); l’accès continue jusqu’à la fin de la période payée. Aucun remboursement au prorata, sauf si la loi l’exige.',
      'Nous pouvons changer les prix avec un préavis d’au moins 30 jours.',
    ]],
    ['Tes données', [
      'Tes données t’appartiennent. Tu peux les exporter en tout temps. À la fin de l’abonnement, elles restent disponibles en lecture et en exportation pendant au moins 90 jours.',
      'Tu es responsable de l’exactitude de tes documents (prix, taxes, mentions légales) et du respect des lois qui s’appliquent à ton entreprise, y compris la Loi 25 pour les renseignements de tes clients.',
    ]],
    ['Utilisation acceptable', ['Pas d’utilisation illégale, de pourriel, de tentative d’accès aux données d’autrui ni de surcharge volontaire du service.']],
    ['Disponibilité', ['Nous visons un service disponible en tout temps, sans pouvoir le garantir (entretien, pannes de fournisseurs). L’app continue de fonctionner hors ligne sur tes appareils.']],
    ['Responsabilité', ['Le service est fourni tel quel. Dans la mesure permise par la loi, notre responsabilité totale est limitée aux montants payés au cours des 12 derniers mois. Rien dans ces conditions ne limite les droits que te confère la loi.']],
    ['Loi applicable', ['Ces conditions sont régies par les lois du Québec et du Canada. Les tribunaux du Québec sont compétents, sous réserve des droits du consommateur.']],
    ['Contact', [`${OPERATOR.legalName}, ${OPERATOR.address} — ${OPERATOR.email} — ${OPERATOR.phone}. Dernière mise à jour: ${UPDATED}.`]],
  ];
}

function termsEn(): Section[] {
  const n = PRODUCT.name;
  return [
    ['The service', [`${n} is online business management software (quotes, invoices, scheduling, crew, expenses, mileage) provided by ${OPERATOR.legalName}. By creating an account you accept these terms.`]],
    ['Your account', ['You are responsible for your password and the access you give your crew.']],
    ['Trial and subscription', [
      `${PRODUCT.trialDays}-day free trial, no credit card. Then the subscription is monthly, payable in advance, taxes extra, and renews automatically.`,
      'You can cancel anytime in the app (Subscription → Manage); access continues until the end of the paid period. No prorated refunds unless required by law. Prices may change with at least 30 days’ notice.',
    ]],
    ['Your data', ['Your data belongs to you and can be exported anytime. After the subscription ends, it remains available for viewing and export for at least 90 days. You are responsible for the accuracy of your documents and your compliance with laws that apply to your business.']],
    ['Acceptable use', ['No illegal use, spam, attempts to access others’ data or deliberate overloading of the service.']],
    ['Liability', ['The service is provided as is. To the extent permitted by law, our total liability is limited to the amounts paid in the last 12 months. Nothing here limits your statutory rights.']],
    ['Governing law', ['These terms are governed by the laws of Québec and Canada.']],
    ['Contact', [`${OPERATOR.legalName}, ${OPERATOR.address} — ${OPERATOR.email}. Last updated: ${UPDATED}.`]],
  ];
}

/** Politique de confidentialité et conditions d'utilisation (Loi 25). */
export default function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  const lang = useLang();
  const en = lang === 'en';
  const sections = kind === 'privacy' ? (en ? privacyEn() : privacyFr()) : en ? termsEn() : termsFr();
  const title = kind === 'privacy' ? (en ? 'Privacy policy' : 'Politique de confidentialité') : en ? 'Terms of use' : 'Conditions d’utilisation';
  return (
    <div className="legal">
      <div className="su-top">
        <Link to="/produit" className="lp-brand"><span className="lp-logo">{PRODUCT.name.slice(0, 1)}</span>{PRODUCT.name}</Link>
        <button className="lp-lang" onClick={() => setLang(en ? 'fr' : 'en')}>{en ? 'FR' : 'EN'}</button>
      </div>
      <article>
        <button className="btn small" onClick={() => (history.length > 1 ? history.back() : (location.hash = '#/produit'))}><ArrowLeft size={14} /> {en ? 'Back' : 'Retour'}</button>
        <h1>{title}</h1>
        {sections.map(([h, ps]) => (
          <section key={h}>
            <h2>{h}</h2>
            {ps.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
          </section>
        ))}
      </article>
    </div>
  );
}
