import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, CalendarDays, Check, ClipboardList, FileText, MapPin, Mic, MicOff, RotateCcw, Sparkles, UserPlus } from 'lucide-react';
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
import { parseJobCommand } from '../lib/voiceJob';

const EXAMPLE = '« Véronique Girard, 12 rue des Pins à Laval, entretien de gouttières 60 pieds linéaires mardi à 9 h »';

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
}

const QUESTION = 'OK! C’est quoi la job pour la soumission?';

/** L'app pose la question à voix haute (si le téléphone le permet). */
function say(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text.replace('’', "'"));
    u.lang = 'fr-CA';
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* pas de voix */
  }
}

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
  const [done, setDone] = useState<{ jobId: number; quoteId?: number; date: string; time: string; total: number; number?: string; visit: boolean } | null>(null);
  const rec = useRef<Listening | null>(null);
  const [ask, setAsk] = useState(false);
  const [answer, setAnswer] = useState('');
  const target = useRef<'cmd' | 'answer'>('cmd');
  const up = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  useEffect(() => () => rec.current?.stop(), []);

  const analyse = (text: string) => {
    if (!text.trim()) return;
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
      items: items.length ? items : [{ code: '', description: r.leftovers.join(' ') || '', quantity: 1, unitPrice: 0 }],
      quote: true,
      kind: r.kind,
    };
    setDraft(d);
    // Visite (ou job sans travaux compris): on demande ce qu'il y a à faire pour la soumission
    if (r.kind === 'visite' || !items.length) {
      setAsk(true);
      setAnswer('');
      say(QUESTION);
    }
    setFound(null);
    // Adresse dite → l'adresse exacte qui existe, proposée d'un toucher
    if (r.address) void suggestAddresses(r.address).then((list) => list[0]?.resolve()).then((g) => g && setFound({ label: g.label, geo: g.geo })).catch(() => undefined);
  };

  const mic = (to: 'cmd' | 'answer' = 'cmd') => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    target.current = to;
    if (to === 'cmd') {
      setHeard('');
      setDone(null);
    } else setAnswer('');
    window.speechSynthesis?.cancel();
    const r = listen(
      (text) => (to === 'cmd' ? setHeard(text) : setAnswer(text)),
      (err) => {
        setListening(false);
        if (err) notify(err, 'err');
      },
    );
    if (!r) return notify('La dictée n’est pas disponible sur ce navigateur — écris la phrase dans la case.', 'err');
    rec.current = r;
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

  /** Réponse à « c'est quoi la job? » → lignes de la soumission. */
  const applyAnswer = (text: string) => {
    if (!text.trim() || !draft) return;
    const r = parseDictation(text, services, []);
    const c = draft.clientId ? clients.find((x) => x.id === draft.clientId) : undefined;
    const items = r.lines.map((l) => {
      const sv = services.find((x) => x.code === l.code)!;
      return lineFromService(sv, l.quantity, c?.lang ?? 'fr');
    });
    if (r.leftovers.length) items.push({ code: '', description: r.leftovers.join(' '), quantity: 1, unitPrice: 0 });
    up({ items: items.length ? items : [{ code: '', description: text.trim(), quantity: 1, unitPrice: 0 }], quote: true });
    setAsk(false);
    if (!r.lines.length) notify('Je n’ai pas reconnu de service: vérifie la ligne et le prix.', 'err');
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
      // Après une visite, la facture vient de la soumission; sinon, de la job
      if (done.quoteId && done.visit) {
        const q = (await db.docs.get(done.quoteId))!;
        if (q.convertedInvoiceId && (await db.docs.get(q.convertedInvoiceId))) return nav(`/doc/${q.convertedInvoiceId}`);
        const st = await getSettings();
        const now = new Date().toISOString();
        const date = todayISO();
        const invId = await db.docs.add({ ...q, id: undefined, type: 'invoice', number: await takeNextNumber('invoice'), date, dueDate: addDays(date, st.paymentTermsDays), notes: st.invoiceNotes, status: 'draft', payments: [], sourceQuoteId: q.id, signature: undefined, portalToken: undefined, viewedAt: undefined, sentAt: undefined, createdAt: now, updatedAt: now });
        await db.docs.update(q.id!, { convertedInvoiceId: invId, status: q.status === 'draft' || q.status === 'sent' ? 'accepted' : q.status });
        return nav(`/doc/${invId}`);
      }
      nav(`/doc/${await jobToInvoice(done.jobId)}`);
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
          <div className="eyebrow"><Sparkles size={14} /> Commande vocale</div>
          <h1>Dicte ta job</h1>
        </div>
      </div>

      {!draft && !done && (
        <div className="card vj-mic">
          {speechSupported() && (
            <button className={`vj-btn ${listening ? 'on' : ''}`} onClick={() => mic('cmd')} aria-label={listening ? 'Arrêter' : 'Parler'}>
              {listening ? <MicOff size={34} /> : <Mic size={34} />}
            </button>
          )}
          <div className="vj-hint">{listening ? 'J’écoute… touche le micro quand t’as fini.' : speechSupported() ? 'Touche le micro et dis tout d’un coup :' : 'Écris la phrase :'}</div>
          <div className="small muted">{EXAMPLE}</div>
          <textarea className="vj-text" value={heard} placeholder="Client, adresse, job, quantités, journée…" onChange={(e) => setHeard(e.target.value)} rows={3} />
          {!listening && heard.trim() && <button className="btn accent big" onClick={() => analyse(heard)}><Check size={18} /> Analyser</button>}
        </div>
      )}

      {draft && ask && (
        <div className="card vj-ask">
          <div className="vj-bubble">{QUESTION}</div>
          {speechSupported() && (
            <button className={`vj-btn small ${listening ? 'on' : ''}`} onClick={() => mic('answer')} aria-label={listening ? 'Arrêter' : 'Répondre'}>
              {listening ? <MicOff size={26} /> : <Mic size={26} />}
            </button>
          )}
          <div className="small muted">ex.: « 50 pieds de gouttières à laver »</div>
          <textarea className="vj-text" rows={2} value={answer} placeholder="Ce qu’il y a à faire…" onChange={(e) => setAnswer(e.target.value)} />
          <div className="row" style={{ justifyContent: 'center' }}>
            {!listening && answer.trim() && <button className="btn accent" onClick={() => applyAnswer(answer)}><Check size={17} /> OK</button>}
            <button className="btn" onClick={() => { setAsk(false); up({ quote: false, items: [] }); }}>Pas de soumission pour l’instant</button>
          </div>
        </div>
      )}

      {draft && !ask && (
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
          <label className="check" style={{ margin: '0 4px 12px' }}><input type="checkbox" checked={draft.quote} onChange={(e) => up({ quote: e.target.checked })} /> Préparer la soumission en même temps</label>
          <div className="vj-actions">
            <button className="btn" onClick={() => { setDraft(null); }}><RotateCcw size={16} /> Recommencer</button>
            <button className="btn accent big" disabled={busy} onClick={() => void create()}><CalendarCheck size={18} /> {busy ? '…' : draft.quote ? 'Planifier + soumission' : 'Planifier la job'}</button>
          </div>
        </>
      )}

      {done && (
        <div className="card vj-done">
          <div className="vj-ok"><Check size={26} /></div>
          <h2>{done.visit ? 'Visite planifiée' : 'C’est planifié'}</h2>
          <p className="muted">{done.visit ? 'Visite' : 'Job'} le <strong>{when(done.date, done.time)}</strong>{done.quoteId ? <> · soumission <strong>{done.number}</strong> de {money(done.total)} prête à envoyer</> : null}.</p>
          <div className="vj-done-actions">
            {done.quoteId && <button className="btn accent" onClick={() => nav(`/doc/${done.quoteId}`)}><ClipboardList size={17} /> Voir et envoyer la soumission</button>}
            <button className="btn" onClick={() => void invoice()}><FileText size={17} /> Faire la facture</button>
            <button className="btn" onClick={() => nav(`/agenda?d=${done.date}&v=jour`)}><CalendarDays size={17} /> Voir l’agenda</button>
            <button className="btn" onClick={() => setDone(null)}><Mic size={17} /> Dicter une autre job</button>
          </div>
          {!s.homeAddress && <p className="small muted" style={{ marginTop: 10 }}>Ajoute ton adresse dans Paramètres pour que les km se calculent tout seuls.</p>}
        </div>
      )}
    </div>
  );
}
