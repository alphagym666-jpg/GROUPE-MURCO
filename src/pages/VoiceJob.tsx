import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, CalendarDays, Check, ClipboardList, FileText, MapPin, Mic, RotateCcw, Sparkles, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddressInput } from '../components/AddressInput';
import { ClientPicker } from '../components/ClientPicker';
import { lineFromService, LineItems } from '../components/LineItems';
import { errMsg, useToast } from '../components/Toast';
import { blankJob, jobToInvoice } from '../lib/agenda';
import { db, getSettings, takeNextNumber, type Doc, type GeoPoint, type LineItem } from '../lib/db';
import { suggestAddresses } from '../lib/geo';
import { useSettings } from '../lib/hooks';
import { listen, speechSupported, type Listening } from '../lib/speech';
import { addDays, docTotals, lineAmount, money, todayISO } from '../lib/utils';
import { parseDictation } from '../lib/voice';
import { findWhen, parseJobCommand } from '../lib/voiceJob';
import { wordsToNumbers } from '../lib/voice';
import { detectIntent } from '../lib/assistant';
import { propose, quoteToInvoice, type Outcome, type Proposal, type Step } from '../lib/assistantActions';
import { ConfirmList } from '../components/ConfirmList';
import { RelanceModal } from '../components/RelanceModal';
import { MicButton } from '../components/MicButton';
import { Link } from 'react-router-dom';

const EXAMPLE = '« Véronique Girard, 12 rue des Pins à Laval, entretien de gouttières 60 pieds linéaires mardi à 9 h »';
const IDEAS = ['Facture la job de Girard', 'Roy a payé comptant', '45 $ d’essence chez Petro-Canada', 'Déplace Roy à vendredi 9 h', 'J’ai fini la job chez Gagnon', 'Mon horaire demain', 'Combien j’ai fait ce mois-ci?', 'Qu’est-ce que j’ai à faire?', 'Relance les factures en retard'];

interface Draft {
  clientId?: number;
  name: string;
  phone: string;
  address: string;
  geo?: GeoPoint;
  date: string;
  time: string;
  durationMin: number;
  items: LineItem[];
  quote: boolean;
  kind: 'visite' | 'job';
  docType: 'quote' | 'invoice';
  dateSaid: boolean;
  noJob: boolean; // soumission sans journée planifiée
  addrIncomplete: boolean;
}

type Slot = 'name' | 'address' | 'job' | 'date';

const QUESTIONS: Record<Slot, (d: Draft) => string> = {
  name: () => 'C’est pour quel client?',
  address: (d) => (d.address ? `L’adresse, c’est ${d.address}… quoi au juste?` : 'À quelle adresse?'),
  job: (d) => (d.kind === 'visite' ? 'OK! C’est quoi la job pour la soumission?' : d.docType === 'invoice' ? 'C’est quoi la job à facturer?' : 'C’est quoi la job?'),
  date: () => 'C’est pour quand?',
};
const EXAMPLES: Record<Slot, string> = {
  name: 'ex.: « Nathalie Bouchard »',
  address: 'ex.: « 1835 rue des Érables à Laval »',
  job: 'ex.: « 50 pieds de gouttières à laver »',
  date: 'ex.: « jeudi à 10 h » — ou « pas de date »',
};

const hasWork = (d: Draft) => d.items.some((it) => it.code || it.unitPrice || it.description.trim());
/** Prochaine info manquante (une question à la fois). */
function nextSlot(d: Draft): Slot | null {
  if (!d.clientId && !d.name.trim()) return 'name';
  if (!d.address.trim() || d.addrIncomplete) return 'address';
  if (!hasWork(d)) return 'job';
  if (d.docType !== 'invoice' && !d.dateSaid) return 'date';
  return null;
}

/** L'app parle (si le téléphone le permet), puis appelle « then » quand elle a fini. */
function say(text: string, then?: () => void) {
  let called = false;
  const once = () => {
    if (!called && then) {
      called = true;
      then();
    }
  };
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/’/g, "'"));
    u.lang = 'fr-CA';
    u.rate = 1.05;
    u.onend = once;
    u.onerror = once;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    // Certains Android n'annoncent jamais la fin: on rouvre le micro quand même
    if (then) setTimeout(once, 900 + text.length * 70);
  } catch {
    once();
  }
}
const capName = (t: string) => t.trim().replace(/[.!?]+$/, '').replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** Une phrase → client, job planifiée et soumission prête (puis la facture d'un bouton). */
export default function VoiceJob() {
  const nav = useNavigate();
  const notify = useToast();
  const s = useSettings();
  const services = useLiveQuery(() => db.services.orderBy('order').toArray(), []) ?? [];
  const clients = useLiveQuery(() => db.clients.toArray(), []) ?? [];
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [found, setFound] = useState<{ label: string; geo: GeoPoint } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ jobId?: number; quoteId?: number; invoiceId?: number; date: string; time: string; total: number; number?: string; visit: boolean } | null>(null);
  const rec = useRef<Listening | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const voiceMode = useRef(false);
  const listeningRef = useRef(false); // on parle: après chaque question, le micro se rouvre tout seul
  const [answer, setAnswer] = useState('');
  const target = useRef<'cmd' | 'answer'>('cmd');
  const up = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  useEffect(() => () => rec.current?.stop(), []);
  const [prop, setProp] = useState<Proposal | null>(null);
  const [relanceDoc, setRelanceDoc] = useState<Proposal['relance'] | null>(null);

  const show = (p: Outcome) => {
    setProp(p);
    if (p.say) say(p.say);
  };
  const doStep = async (step: Step) => {
    setBusy(true);
    try {
      show(await step.run());
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const analyse = (text: string) => {
    if (!text.trim()) return;
    setProp(null);
    const intent = detectIntent(text, clients, todayISO());
    // « Facture pour Nathalie Bouchard… » (nouveau client): on crée tout
    // Le nom dit ne correspond à aucun client (« Nathalie Bouchard » ≠ « Clinique Bouchard »): nouveau client
    const pj = parseJobCommand(text, services, clients.map((c) => ({ id: c.id, name: c.name })), todayISO());
    const spokenNew = pj.isNew && pj.clientName.split(' ').length >= 2;
    const create = intent.kind === 'planifier' || (intent.kind === 'facturer' && ((!intent.clientId && /\b(pour|chez|a|à)\s+\p{L}/iu.test(text)) || spokenNew));
    if (!create) {
      setDraft(null);
      setDone(null);
      void propose(intent).then(show).catch((e) => notify(errMsg(e), 'err'));
      return;
    }
    setProp(null);
    const r = parseJobCommand(text, services, clients.map((c) => ({ id: c.id, name: c.name })), todayISO());
    const c = r.clientId ? clients.find((x) => x.id === r.clientId) : undefined;
    const items = r.lines.map((l) => {
      const sv = services.find((x) => x.code === l.code);
      return sv ? lineFromService(sv, l.quantity, c?.lang ?? 'fr') : { code: l.code, description: l.code, quantity: l.quantity, unitPrice: 0 };
    });
    const d: Draft = {
      clientId: c?.id,
      name: c?.name ?? r.clientName,
      phone: r.phone ?? c?.phone ?? '',
      address: r.address ?? c?.address ?? '',
      geo: r.address ? undefined : c?.geo,
      date: r.date,
      time: r.time ?? '',
      durationMin: 120,
      items: items.length ? items : r.kind !== 'visite' && r.leftovers.join(' ').trim().length > 3 ? [{ code: '', description: r.leftovers.join(' '), quantity: 1, unitPrice: 0 }] : [],
      quote: true,
      kind: r.kind,
      docType: r.docType,
      dateSaid: r.dateSaid,
      noJob: false,
      addrIncomplete: r.addressIncomplete,
    };
    setFound(null);
    setDone(null);
    proceed(d);
    // Adresse dite → l'adresse exacte qui existe
    if (r.address && !r.addressIncomplete) autoAddress(r.address);
  };

  /** Adresse dite → la première adresse qui existe, appliquée tout de suite (modifiable). */
  const autoAddress = (spoken: string) => {
    void suggestAddresses(spoken).then((list) => list[0]?.resolve()).then((g) => {
      if (g) setDraft((x) => (x && (x.address === spoken || !x.geo) ? { ...x, address: g.label, geo: g.geo, addrIncomplete: false } : x));
    }).catch(() => undefined);
  };

  /** Met à jour le brouillon et pose la prochaine question qui manque (ou montre le résumé). */
  const proceed = (d: Draft) => {
    if (d.docType === 'invoice') d = { ...d, quote: false };
    setDraft(d);
    const next = nextSlot(d);
    setSlot(next);
    setAnswer('');
    if (next) {
      say(QUESTIONS[next](d), () => { if (voiceMode.current && speechSupported()) mic('answer', true); });
    } else {
      say(d.docType === 'invoice' ? 'Parfait. Vérifie, puis crée la facture.' : 'Parfait. Vérifie, puis confirme.');
    }
  };

  const mic = (to: 'cmd' | 'answer' = 'cmd', auto = false) => {
    if (listeningRef.current) {
      if (!auto) rec.current?.stop();
      return;
    }
    target.current = to;
    voiceMode.current = true;
    if (to === 'cmd') {
      setHeard('');
      setDone(null);
    } else setAnswer('');
    window.speechSynthesis?.cancel();
    const r = listen(
      (text) => (to === 'cmd' ? setHeard(text) : setAnswer(text)),
      (err) => {
        listeningRef.current = false;
        setListening(false);
        if (err && !(auto && /rien entendu/.test(err))) notify(err, 'err');
      },
    );
    if (!r) return notify('La dictée n’est pas disponible sur ce navigateur — écris la phrase dans la case.', 'err');
    rec.current = r;
    listeningRef.current = true;
    setListening(true);
  };

  // Fin de la dictée → on analyse tout de suite
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !listening) {
      if (target.current === 'cmd' && heard) analyse(heard);
      if (target.current === 'answer' && answer) applyAnswer(answer);
    }
    wasListening.current = listening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  /** Réponse à la question posée → on remplit, puis prochaine question. */
  const applyAnswer = (text: string) => {
    if (!text.trim() || !draft || !slot) return;
    const t = text.trim();
    if (slot === 'name') {
      const r = parseJobCommand(`pour ${t}`, services, clients.map((c) => ({ id: c.id, name: c.name })), todayISO());
      const c = r.clientId ? clients.find((x) => x.id === r.clientId) : undefined;
      const patch: Partial<Draft> = c ? { clientId: c.id, name: c.name, address: draft.address || c.address, geo: draft.address ? draft.geo : c.geo } : { name: r.clientName || capName(t) };
      if (r.address && !draft.address) Object.assign(patch, { address: r.address, addrIncomplete: r.addressIncomplete });
      proceed({ ...draft, ...patch });
      if (r.address && !r.addressIncomplete) autoAddress(r.address);
      return;
    }
    if (slot === 'address') {
      const spoken = t.replace(/^(?:c est |c'est |au |à |a )/i, '').replace(/\b(\d{1,3})[-\s](\d{2,3})\b(?=\s+\D)/, '$1$2');
      // « des Érables » seulement: on complète l'adresse déjà dite
      const full = /^\d/.test(spoken) || !draft.address ? spoken : `${draft.address} ${spoken}`.replace(/\s+/g, ' ');
      proceed({ ...draft, address: full, geo: undefined, addrIncomplete: false });
      autoAddress(full);
      return;
    }
    if (slot === 'job') {
      const r = parseDictation(t, services, []);
      const c = draft.clientId ? clients.find((x) => x.id === draft.clientId) : undefined;
      const items = r.lines.map((l) => lineFromService(services.find((x) => x.code === l.code)!, l.quantity, c?.lang ?? 'fr'));
      if (r.leftovers.length) items.push({ code: '', description: r.leftovers.join(' '), quantity: 1, unitPrice: 0 });
      if (!r.lines.length) notify('Je n’ai pas reconnu de service: vérifie la ligne et le prix.', 'err');
      proceed({ ...draft, items: items.length ? items : [{ code: '', description: t, quantity: 1, unitPrice: 0 }] });
      return;
    }
    // date
    if (/\b(pas de date|plus tard|sais pas|je ne sais pas|aucune|non)\b/i.test(t)) return proceed({ ...draft, dateSaid: true, noJob: true });
    const w = findWhen(wordsToNumbers(t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()), todayISO());
    proceed({ ...draft, date: w.date, time: w.time ?? draft.time, dateSaid: true, noJob: false });
  };

  const create = async () => {
    if (!draft) return;
    if (!draft.clientId && !draft.name.trim()) return notify('Quel est le nom du client?', 'err');
    setBusy(true);
    try {
      const st = await getSettings();
      const now = new Date().toISOString();
      let clientId = draft.clientId;
      if (!clientId) {
        clientId = await db.clients.add({ name: draft.name.trim(), contact: '', email: '', phone: draft.phone.trim(), address: draft.address.trim(), geo: draft.geo, notes: '', createdAt: now });
      } else if (draft.phone && !(await db.clients.get(clientId))?.phone) {
        await db.clients.update(clientId, { phone: draft.phone.trim() });
      }
      const items = draft.items.filter((it) => it.description.trim() || it.unitPrice || it.code);
      const work = items.map((it) => it.description).filter(Boolean).join(' + ');
      const title = work || 'Job';
      const visit = draft.kind === 'visite';
      if (draft.docType === 'invoice') {
        const date = todayISO();
        const number = await takeNextNumber('invoice');
        const invoiceId = await db.docs.add({
          type: 'invoice', number, clientId, date, dueDate: addDays(date, st.paymentTermsDays), jobDate: date, jobAddress: draft.address.trim(), jobGeo: draft.geo, title, items,
          applyTps: st.chargeTaxes, applyTvq: st.chargeTaxes, notes: st.invoiceNotes, status: 'draft', payments: [], createdAt: now, updatedAt: now,
        });
        const total = docTotals({ items, applyTps: st.chargeTaxes, applyTvq: st.chargeTaxes, payments: [] }, st).total;
        setDone({ invoiceId, date, time: '', total, number, visit: false });
        say(`La facture ${number} de ${Math.round(total)} dollars est prête.`);
        setDraft(null);
        setHeard('');
        return;
      }
      if (draft.noJob) {
        const date = todayISO();
        const number = await takeNextNumber('quote');
        const quoteId = await db.docs.add({
          type: 'quote', number, clientId, date, dueDate: addDays(date, st.quoteValidityDays), jobDate: date, jobAddress: draft.address.trim(), jobGeo: draft.geo, title, items,
          applyTps: st.chargeTaxes, applyTvq: st.chargeTaxes, notes: st.quoteNotes, status: 'draft', payments: [], createdAt: now, updatedAt: now,
        });
        const total = docTotals({ items, applyTps: st.chargeTaxes, applyTvq: st.chargeTaxes, payments: [] }, st).total;
        setDone({ quoteId, date, time: '', total, number, visit: false });
        say(`La soumission ${number} est prête.`);
        setDraft(null);
        setHeard('');
        return;
      }
      const jobId = await db.jobs.add({
        ...blankJob(draft.date, clientId), time: draft.time, durationMin: visit ? Math.min(draft.durationMin, 60) : draft.durationMin,
        address: draft.address.trim(), geo: draft.geo, title: visit ? `Visite d’estimation${work ? ` — ${work}` : ''}` : title,
        items: visit ? [] : items, type: visit ? 'estimation' : undefined,
      });
      let quoteId: number | undefined;
      let number: string | undefined;
      if (draft.quote) {
        const date = todayISO();
        number = await takeNextNumber('quote');
        const q: Doc = {
          type: 'quote', number, clientId, date, dueDate: addDays(date, st.quoteValidityDays), jobDate: draft.date,
          jobAddress: draft.address.trim(), jobGeo: draft.geo, title, items,
          applyTps: st.chargeTaxes, applyTvq: st.chargeTaxes, notes: st.quoteNotes, status: 'draft', payments: [], jobId, createdAt: now, updatedAt: now,
        };
        quoteId = await db.docs.add(q);
      }
      const total = docTotals({ items, applyTps: st.chargeTaxes, applyTvq: st.chargeTaxes, payments: [] }, st).total;
      setDone({ jobId, quoteId, date: draft.date, time: draft.time, total, number, visit: draft.kind === 'visite' });
      setDraft(null);
      setHeard('');
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const invoice = async () => {
    if (!done) return;
    try {
      if (done.invoiceId) return nav(`/doc/${done.invoiceId}`);
      if (!done.jobId) return nav(`/doc/${await quoteToInvoice((await db.docs.get(done.quoteId!))!)}`);
      // Après une visite, la facture vient de la soumission; sinon, de la job
      if (done.quoteId && done.visit) {
        return nav(`/doc/${await quoteToInvoice((await db.docs.get(done.quoteId))!)}`);
      }
      nav(`/doc/${await jobToInvoice(done.jobId!)}`);
    } catch (e) {
      notify(errMsg(e), 'err');
    }
  };

  const total = draft ? draft.items.reduce((a, it) => a + lineAmount(it), 0) : 0;
  const when = (d: string, t: string) => `${new Date(d + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })}${t ? ` à ${Number(t.slice(0, 2))} h${t.slice(3) !== '00' ? ` ${t.slice(3)}` : ''}` : ''}`;

  return (
    <div className="vj">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> Assistant</div>
          <h1>Qu’est-ce que je fais pour toi?</h1>
        </div>
      </div>

      {prop && (
        <div className="card vj-prop">
          <div className="vj-bubble">{prop.say}</div>
          {(prop.confirm || prop.next?.length || prop.links?.length || prop.relance) && (
            <div className="vj-done-actions">
              {prop.confirm && <button className="btn accent big" disabled={busy} onClick={() => void doStep(prop.confirm!)}><Check size={18} /> {prop.confirm.label}</button>}
              {prop.next?.map((n) => <button key={n.label} className="btn accent" disabled={busy} onClick={() => void doStep(n)}>{n.label}</button>)}
              {prop.relance && <button className="btn accent" onClick={() => setRelanceDoc(prop.relance)}>Texto ou courriel de relance</button>}
              {prop.links?.map((l) => <Link key={l.to} className="btn" to={l.to}>{l.label}</Link>)}
            </div>
          )}
          <button className="btn small" style={{ marginTop: 10 }} onClick={() => { setProp(null); setHeard(''); }}>{prop.confirm ? 'Annuler' : 'Autre chose'}</button>
        </div>
      )}
      {prop?.todo && <ConfirmList limit={8} />}
      {relanceDoc && <RelanceModal doc={relanceDoc} client={clients.find((c) => c.id === relanceDoc.clientId)} onClose={() => setRelanceDoc(null)} />}

      {!draft && !done && (
        <div className="card vj-mic">
          {speechSupported() && (
            <MicButton listening={listening} onClick={() => mic('cmd')} />
          )}
          <div className="vj-hint">{listening ? 'J’écoute… prends ton temps, appuie sur « Arrêter » quand t’as fini.' : speechSupported() ? 'Dis tout d’un coup, ou écris-le :' : 'Écris la phrase :'}</div>
          {!prop && <div className="small muted">Une job: {EXAMPLE}</div>}
          <div className={`vj-ideas ${prop ? 'hide' : ''}`}>
            {IDEAS.map((t) => <button key={t} onClick={() => { setHeard(t); analyse(t); }}>{t}</button>)}
          </div>
          <textarea className="vj-text" value={heard} placeholder="Dis ou écris ce que tu veux: planifier, facturer, relancer, une dépense…" onChange={(e) => setHeard(e.target.value)} rows={3} />
          {!listening && heard.trim() && <button className="btn accent big" onClick={() => analyse(heard)}><Check size={18} /> Analyser</button>}
        </div>
      )}

      {draft && slot && (
        <div className="card vj-ask">
          <div className="vj-sofar">
            {(draft.clientId || draft.name) && <span><UserPlus size={13} /> {draft.name}</span>}
            {draft.address && !draft.addrIncomplete && <span><MapPin size={13} /> {draft.address}</span>}
            {hasWork(draft) && <span><ClipboardList size={13} /> {draft.items.filter((it) => it.description).map((it) => it.description).join(', ')}</span>}
          </div>
          <div className="vj-bubble">{QUESTIONS[slot](draft)}</div>
          {speechSupported() && (
            <MicButton small listening={listening} onClick={() => mic('answer')} startLabel="Répondre" />
          )}
          <div className="small muted">{listening ? 'J’écoute…' : EXAMPLES[slot]}</div>
          <textarea className="vj-text" rows={2} value={answer} placeholder="Ta réponse…" onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyAnswer(answer); } }} />
          <div className="row" style={{ justifyContent: 'center' }}>
            {!listening && answer.trim() && <button className="btn accent" onClick={() => applyAnswer(answer)}><Check size={17} /> OK</button>}
            {slot === 'job' && draft.kind === 'visite' && <button className="btn" onClick={() => proceed({ ...draft, quote: false, items: [{ code: '', description: 'Visite d’estimation', quantity: 1, unitPrice: 0 }] })}>Pas de soumission pour l’instant</button>}
            {slot === 'date' && <button className="btn" onClick={() => proceed({ ...draft, dateSaid: true, noJob: true })}>Pas de date</button>}
            {(slot === 'address' || slot === 'name') && <button className="btn" onClick={() => setSlot(null)}>Passer</button>}
          </div>
        </div>
      )}

      {draft && !slot && (
        <>
          <div className="card">
            <div className="vj-said small muted">« {heard} »</div>
            <h2 style={{ marginTop: 8 }}>Ce que j’ai compris {draft.kind === 'visite' && <span className="badge blue">visite d’estimation</span>}</h2>
            <div className="form-grid">
              <div className="field full">
                <span className="row" style={{ gap: 6 }}>Client {draft.clientId ? <span className="badge green">déjà dans tes clients</span> : <span className="badge blue"><UserPlus size={11} /> nouveau client</span>}</span>
                {draft.clientId
                  ? <ClientPicker value={draft.clientId} onChange={(id) => { const c = clients.find((x) => x.id === id); up({ clientId: id, name: c?.name ?? '', address: draft.address || c?.address || '', geo: draft.address ? draft.geo : c?.geo }); }} />
                  : <input id="vj-name" value={draft.name} placeholder="Nom du client" onChange={(e) => up({ name: e.target.value })} />}
              </div>
              {!draft.clientId && <label className="field">Téléphone<input type="tel" value={draft.phone} onChange={(e) => up({ phone: e.target.value })} /></label>}
              <label className="field full">Adresse des travaux
                <AddressInput value={draft.address} onChange={(v) => { up({ address: v, geo: undefined }); setFound(null); }} onPick={(label, geo) => { up({ address: label, geo }); setFound(null); }} />
              </label>
              {found && found.label !== draft.address && (
                <button className="vj-found full" onClick={() => { up({ address: found.label, geo: found.geo }); setFound(null); }}>
                  <MapPin size={16} /> <span>Adresse trouvée : <strong>{found.label}</strong></span> <span className="vj-use">Utiliser</span>
                </button>
              )}
              <label className="field">Journée<input type="date" value={draft.date} onChange={(e) => e.target.value && up({ date: e.target.value })} /></label>
              <label className="field">Heure<input type="time" value={draft.time} onChange={(e) => up({ time: e.target.value })} /></label>
              <label className="field">Durée
                <select value={draft.durationMin} onChange={(e) => up({ durationMin: Number(e.target.value) })}>
                  {[30, 60, 90, 120, 180, 240, 360, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="card">
            <h2>{draft.kind === 'visite' ? 'Travaux pour la soumission' : 'Travaux'}</h2>
            <LineItems items={draft.items} services={services} onChange={(items) => up({ items })} />
            <div className="vj-total"><span>Total avant taxes</span><b>{money(total)}</b></div>
          </div>
          {draft.docType !== 'invoice' && !draft.noJob && <label className="check" style={{ margin: '0 4px 12px' }}><input type="checkbox" checked={draft.quote} onChange={(e) => up({ quote: e.target.checked })} /> Préparer la soumission en même temps</label>}
          <div className="vj-actions">
            <button className="btn" onClick={() => { setDraft(null); }}><RotateCcw size={16} /> Recommencer</button>
            <button className="btn accent big" disabled={busy} onClick={() => void create()}><CalendarCheck size={18} /> {busy ? '…' : draft.docType === 'invoice' ? 'Créer la facture' : draft.noJob ? 'Créer la soumission' : draft.quote ? 'Planifier + soumission' : 'Planifier la job'}</button>
          </div>
        </>
      )}

      {done && (
        <div className="card vj-done">
          <div className="vj-ok"><Check size={26} /></div>
          <h2>{done.invoiceId ? 'Facture prête' : !done.jobId ? 'Soumission prête' : done.visit ? 'Visite planifiée' : 'C’est planifié'}</h2>
          <p className="muted">
            {done.invoiceId ? <>Facture <strong>{done.number}</strong> de {money(done.total)} prête à envoyer.</>
              : !done.jobId ? <>Soumission <strong>{done.number}</strong> de {money(done.total)} prête à envoyer.</>
              : <>{done.visit ? 'Visite' : 'Job'} le <strong>{when(done.date, done.time)}</strong>{done.quoteId ? <> · soumission <strong>{done.number}</strong> de {money(done.total)} prête à envoyer</> : null}.</>}
          </p>
          <div className="vj-done-actions">
            {done.invoiceId && <button className="btn accent" onClick={() => nav(`/doc/${done.invoiceId}`)}><FileText size={17} /> Voir et envoyer la facture</button>}
            {done.quoteId && <button className="btn accent" onClick={() => nav(`/doc/${done.quoteId}`)}><ClipboardList size={17} /> Voir et envoyer la soumission</button>}
            {!done.invoiceId && <button className="btn" onClick={() => void invoice()}><FileText size={17} /> Faire la facture</button>}
            {done.jobId && <button className="btn" onClick={() => nav(`/agenda?d=${done.date}&v=jour`)}><CalendarDays size={17} /> Voir l’agenda</button>}
            <button className="btn" onClick={() => setDone(null)}><Mic size={17} /> Autre chose</button>
          </div>
          {!s.homeAddress && <p className="small muted" style={{ marginTop: 10 }}>Ajoute ton adresse dans Paramètres pour que les km se calculent tout seuls.</p>}
        </div>
      )}
    </div>
  );
}
