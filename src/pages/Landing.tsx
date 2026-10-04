import {
  ArrowRight, CalendarDays, Camera, Check, CircleCheck, Clock, CreditCard, FileText, Inbox, MapPin, ShieldCheck, Smartphone, Sparkles, TrendingUp, Users, Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSyncState } from '../lib/sync';
import { PRODUCT, OPERATOR } from '../brand';
import { useLang, setLang } from '../lib/i18n';
import { PLANS } from '../lib/plans';

const FEATURES_FR = [
  { icon: Zap, t: 'Facture en 30 secondes', d: 'Tape un code (NDG, LVE…), la quantité, c’est calculé. Minimums, rabais, dépôts et taxes inclus. Dictée vocale sur le chantier.' },
  { icon: CalendarDays, t: 'Agenda qui pense pour toi', d: 'Jour, semaine, mois. Route optimisée, météo sur 16 jours, « reporter la journée » quand il pleut, conflits d’horaire signalés.' },
  { icon: Camera, t: 'Reçus lus tout seuls', d: 'Photo du reçu: montant, taxes, commerce et adresse lus automatiquement. Les km s’ajoutent au journal de bord.' },
  { icon: CreditCard, t: 'Payé plus vite', d: 'Lien client: le client voit sa soumission, la signe du doigt et paie sa facture par carte. Relances en un glissement.' },
  { icon: Users, t: 'Ton équipe sur leur cell', d: 'Employés et vendeurs: leurs jobs, pointage GPS, photos avant/après. Feuilles de temps et commissions calculées.' },
  { icon: Inbox, t: 'Demandes qui deviennent des clients', d: 'Formulaire en ligne et code QR pour tes pubs. Chaque demande arrive dans ton CRM avec sa source et un rappel de suivi.' },
  { icon: TrendingUp, t: 'Tes chiffres, enfin clairs', d: 'Rentabilité par job, rapport TPS/TVQ, seuil des 30 000 $, dossier complet pour le comptable en un clic.' },
  { icon: Smartphone, t: 'Ordi, Android et iPhone', d: 'Tout est synchronisé en temps réel. Fonctionne même sans réseau dans un sous-sol, puis se met à jour tout seul.' },
];
const FEATURES_EN = [
  { icon: Zap, t: 'Invoice in 30 seconds', d: 'Type a code and a quantity, it’s calculated. Minimums, discounts, deposits and taxes included. Voice input on site.' },
  { icon: CalendarDays, t: 'A schedule that thinks for you', d: 'Day, week, month. Optimized route, 16-day weather, “postpone the day” when it rains, scheduling conflicts flagged.' },
  { icon: Camera, t: 'Receipts read automatically', d: 'Snap a receipt: amount, taxes, store and address are read for you. Mileage goes straight into your logbook.' },
  { icon: CreditCard, t: 'Get paid faster', d: 'Client link: your client views the quote, signs with a finger and pays the invoice by card. Reminders in one swipe.' },
  { icon: Users, t: 'Your crew on their phones', d: 'Employees and sales reps: their jobs, GPS time clock, before/after photos. Timesheets and commissions calculated.' },
  { icon: Inbox, t: 'Leads that become clients', d: 'Online form and QR code for your ads. Every request lands in your CRM with its source and a follow-up reminder.' },
  { icon: TrendingUp, t: 'Your numbers, finally clear', d: 'Profit per job, GST/QST report, small-supplier threshold, full accountant package in one click.' },
  { icon: Smartphone, t: 'Desktop, Android and iPhone', d: 'Everything syncs in real time. Works offline in a basement, then catches up on its own.' },
];

/** Page de présentation du logiciel (visiteurs qui n'ont pas encore de compte). */
export default function Landing() {
  const lang = useLang();
  const en = lang === 'en';
  const st = useSyncState();
  const nav = useNavigate();
  // Déjà connecté (ex.: retour sur la page): direction l'app
  useEffect(() => {
    if (st.status === 'ok') nav('/', { replace: true });
  }, [st.status, nav]);
  const [shot, setShot] = useState(0);
  const shots = ['accueil', 'factures', 'agenda', 'recu', 'job'];
  useEffect(() => {
    const t = setInterval(() => setShot((x) => (x + 1) % shots.length), 3200);
    return () => clearInterval(t);
  }, [shots.length]);
  const F = en ? FEATURES_EN : FEATURES_FR;

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-brand"><span className="lp-logo">{PRODUCT.name.slice(0, 1)}</span>{PRODUCT.name}</div>
        <nav>
          <a href="#fonctions" onClick={(e) => { e.preventDefault(); document.getElementById('fonctions')?.scrollIntoView({ behavior: 'smooth' }); }}>{en ? 'Features' : 'Fonctions'}</a>
          <a href="#prix" onClick={(e) => { e.preventDefault(); document.getElementById('prix')?.scrollIntoView({ behavior: 'smooth' }); }}>{en ? 'Pricing' : 'Prix'}</a>
          <button className="lp-lang" onClick={() => setLang(en ? 'fr' : 'en')}>{en ? 'FR' : 'EN'}</button>
          <Link to="/connexion" className="lp-login">{en ? 'Log in' : 'Se connecter'}</Link>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <div className="lp-pill"><Sparkles size={14} /> {en ? 'Built in Québec for contractors' : 'Conçu au Québec pour les entrepreneurs'}</div>
          <h1>{en ? <>Your whole business.<br /><em>In your pocket.</em></> : <>Toute ta business.<br /><em>Dans ta poche.</em></>}</h1>
          <p>{en ? PRODUCT.taglineEn : PRODUCT.tagline}</p>
          <div className="lp-cta">
            <Link to="/demarrer" className="btn accent big">{en ? `Start ${PRODUCT.trialDays}-day free trial` : `Essai gratuit ${PRODUCT.trialDays} jours`} <ArrowRight size={18} /></Link>
            <Link to="/connexion" className="btn big lp-ghost">{en ? 'I have an account' : 'J’ai déjà un compte'}</Link>
          </div>
          <div className="lp-trust">
            <span><Check size={15} /> {en ? 'No credit card' : 'Sans carte de crédit'}</span>
            <span><Check size={15} /> {en ? 'Ready in 2 minutes' : 'Prêt en 2 minutes'}</span>
            <span><Check size={15} /> {en ? 'Cancel anytime' : 'Annulable en tout temps'}</span>
          </div>
        </div>
        <div className="lp-phone" aria-hidden="true">
          <div className="lp-phone-frame">
            {shots.map((s, i) => <img key={s} src={`./marketing/${s}.jpg`} alt="" className={i === shot ? 'on' : ''} loading={i ? 'lazy' : 'eager'} />)}
          </div>
          <div className="lp-float f1"><CircleCheck size={16} /> {en ? 'Invoice paid — $210' : 'Facture payée — 210 $'}</div>
          <div className="lp-float f2"><MapPin size={16} /> {en ? '28.4 km logged' : '28,4 km au journal'}</div>
          <div className="lp-float f3"><Clock size={16} /> {en ? 'Marc clocked in' : 'Marc a pointé'}</div>
        </div>
      </section>

      <section className="lp-strip">
        <div><b>30 s</b><span>{en ? 'to create an invoice' : 'pour faire une facture'}</span></div>
        <div><b>0</b><span>{en ? 'receipts to type' : 'reçu à taper à la main'}</span></div>
        <div><b>100 %</b><span>{en ? 'of km tracked' : 'des km comptés'}</span></div>
        <div><b>3</b><span>{en ? 'devices, always in sync' : 'appareils, toujours à jour'}</span></div>
      </section>

      <section className="lp-features" id="fonctions">
        <h2>{en ? 'Everything a contractor needs. Nothing extra.' : 'Tout ce qu’un entrepreneur a besoin. Rien de trop.'}</h2>
        <div className="lp-grid">
          {F.map((f) => (
            <div key={f.t} className="lp-card">
              <span className="lp-ico"><f.icon size={22} /></span>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-trades">
        <h2>{en ? 'Made for your trade' : 'Fait pour ton métier'}</h2>
        <div className="lp-chips">
          {(en ? ['Exterior maintenance', 'Landscaping', 'Painting', 'Cleaning', 'Snow removal', 'Renovation', 'Any trade'] : ['Entretien extérieur', 'Paysagement', 'Peinture', 'Ménage', 'Déneigement', 'Rénovation', 'Tous les métiers']).map((t) => <span key={t}>{t}</span>)}
        </div>
        <p className="lp-muted">{en ? 'Pick your trade at sign-up: your price codes are ready to use.' : 'Choisis ton métier à l’inscription: tes codes de prix sont prêts à utiliser.'}</p>
      </section>

      <section className="lp-pricing" id="prix">
        <h2>{en ? 'Simple pricing' : 'Des prix simples'}</h2>
        <p className="lp-muted">{en ? `${PRODUCT.trialDays} days free, no card. Then monthly, cancel anytime. Prices in CAD, taxes extra.` : `${PRODUCT.trialDays} jours gratuits, sans carte. Ensuite au mois, annulable en tout temps. Prix en $ CA, taxes en sus.`}</p>
        <div className="lp-plans">
          {PLANS.map((p) => (
            <div key={p.key} className={`lp-plan ${p.highlight ? 'hot' : ''}`}>
              {p.highlight && <div className="lp-badge">{en ? 'Most popular' : 'Le plus populaire'}</div>}
              <h3>{p.name}</h3>
              <div className="lp-price"><b>{p.price} $</b><span>/{en ? 'mo' : 'mois'}</span></div>
              <p className="lp-muted">{p.pitch}</p>
              <ul>{p.features.map((f) => <li key={f}><Check size={15} /> {f}</li>)}</ul>
              <Link to={`/demarrer?forfait=${p.key}`} className={`btn block ${p.highlight ? 'accent' : ''}`}>{en ? 'Start free' : 'Commencer gratuitement'}</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-faq">
        <h2>{en ? 'Questions' : 'Questions'}</h2>
        {(en ? [
          ['Do I need to install anything?', 'No. It works in your browser on computer and phone. Android and iPhone apps are also available.'],
          ['What about my data?', 'Your data belongs to you. It is hosted on Google Cloud, encrypted, and you can export or delete it at any time (Québec Law 25).'],
          ['Can my accountant use it?', 'Yes: one click produces a ZIP with every invoice, receipt, the logbook and the GST/QST report.'],
          ['What happens after the trial?', 'Choose a plan to keep going. If you don’t, your data stays available for export.'],
        ] : [
          ['Faut-il installer quelque chose?', 'Non. Ça fonctionne dans le navigateur, sur l’ordi et le cell. Des apps Android et iPhone sont aussi offertes.'],
          ['Et mes données?', 'Tes données t’appartiennent. Elles sont hébergées sur Google Cloud, chiffrées, et tu peux les exporter ou les supprimer en tout temps (Loi 25).'],
          ['Mon comptable peut-il s’en servir?', 'Oui: un clic produit un ZIP avec toutes les factures, les reçus, le journal de bord et le rapport TPS/TVQ.'],
          ['Qu’arrive-t-il après l’essai?', 'Tu choisis un forfait pour continuer. Sinon, tes données restent disponibles pour l’exportation.'],
        ]).map(([q, a]) => (
          <details key={q} className="lp-q"><summary>{q}</summary><p>{a}</p></details>
        ))}
      </section>

      <section className="lp-final">
        <ShieldCheck size={30} />
        <h2>{en ? 'Try it on your next job.' : 'Essaie-le sur ta prochaine job.'}</h2>
        <Link to="/demarrer" className="btn accent big">{en ? 'Start free' : 'Commencer gratuitement'} <ArrowRight size={18} /></Link>
      </section>

      <footer className="lp-foot">
        <div><FileText size={14} /> {PRODUCT.name} — {OPERATOR.legalName}</div>
        <div className="row">
          <Link to="/confidentialite">{en ? 'Privacy' : 'Confidentialité'}</Link>
          <Link to="/conditions">{en ? 'Terms' : 'Conditions d’utilisation'}</Link>
          <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        </div>
      </footer>
    </div>
  );
}
