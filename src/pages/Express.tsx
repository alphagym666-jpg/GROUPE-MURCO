import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, ArrowRight, Banknote, CreditCard, Calculator, Check, CircleCheck, FileText, Mail, Mic, MicOff, Minus, Plus, Search, Share2, UserPlus, Zap,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AddressInput } from '../components/AddressInput';
import { CalcModal, lineFromService } from '../components/LineItems';
import { MediaGallery, ProofPhoto } from '../components/MediaGallery';
import { SendEmailModal } from '../components/SendEmailModal';
import { errMsg, useToast } from '../components/Toast';
import { db, getSettings, takeNextNumber, type Client, type Doc, type GeoPoint, type LineItem } from '../lib/db';
import { makeDocPdf } from '../lib/docPdf';
import { useSettings } from '../lib/hooks';
import { docFileName } from '../lib/pdf';
import { listen, speechSupported, type Listening } from '../lib/speech';
import { syncTripForDoc } from '../lib/trips';
import { syncDayRoute } from '../lib/agenda';
import { publishPortal } from '../lib/portal';
import { shareFiles } from '../lib/native';
import { addDays, docTotals, downloadBlob, km, lineAmount, money, round2, todayISO } from '../lib/utils';
import { parseDictation } from '../lib/voice';
import { NumInput } from '../components/NumInput';

const STEPS = ['Client', 'Travaux', 'Finaliser'];
const PAY_METHODS = ['Comptant', 'Virement Interac', 'Chèque'];

/** Facture en 30 secondes sur le terrain: client → codes → envoyer. */
export default function Express() {
  const nav = useNavigate();
  const notify = useToast();
  const s = useSettings();
  const [step, setStep] = useState(0);
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState<number>();
  const [newClient, setNewClient] = useState<{ name: string; phone: string; email: string; address: string; geo?: GeoPoint } | null>(null);
  const [lines, setLines] = useState<LineItem[]>([]);
  const [calcFor, setCalcFor] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [addressGeo, setAddressGeo] = useState<GeoPoint>();
  const [title, setTitle] = useState('');
  const [discount, setDiscount] = useState(0);
  const [paidNow, setPaidNow] = useState(false);
  const [payMethod, setPayMethod] = useState('Comptant');
  const [proofId, setProofId] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ doc: Doc; client?: Client; trip?: number } | null>(null);
  const [mailPdf, setMailPdf] = useState<Blob | null>(null);
  const [heard, setHeard] = useState('');
  const [listening, setListening] = useState(false);
  const rec = useRef<Listening | null>(null);

  const clients = useLiveQuery(() => db.clients.toArray(), []) ?? [];
  const services = useLiveQuery(() => db.services.orderBy('order').toArray(), []) ?? [];
  const recentIds = useLiveQuery(async () => {
    const docs = await db.docs.orderBy('date').reverse().limit(40).toArray();
    return [...new Set(docs.map((d) => d.clientId))];
  }, []) ?? [];

  const client = clients.find((c) => c.id === clientId);
  const shown = useMemo(() => {
    const n = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (q.trim()) return clients.filter((c) => n(`${c.name} ${c.phone} ${c.address}`).includes(n(q))).slice(0, 12);
    const recent = recentIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean) as Client[];
    const rest = clients.filter((c) => !recentIds.includes(c.id!)).sort((a, b) => a.name.localeCompare(b.name));
    return [...recent, ...rest].slice(0, 12);
  }, [q, clients, recentIds]);

  const fake: Pick<Doc, 'items' | 'applyTps' | 'applyTvq' | 'payments' | 'discount' | 'deposit'> = {
    items: lines, applyTps: s.chargeTaxes, applyTvq: s.chargeTaxes, payments: [], discount,
  };
  const tot = docTotals(fake, s);

  const pickClient = (c: Client) => {
    setClientId(c.id);
    setAddress(c.address);
    setAddressGeo(c.geo);
    setStep(1);
  };

  const addCode = (code: string, qty = 1) => {
    const sv = services.find((x) => x.code === code);
    if (!sv) return;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.code === code);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: round2(l.quantity + qty) } : l));
      return [...ls, lineFromService(sv, qty)];
    });
  };

  const setQty = (i: number, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((_, j) => j !== i) : ls.map((l, j) => (j === i ? { ...l, quantity: qty } : l))));

  const startMic = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    setHeard('');
    const r = listen(
      (text) => setHeard(text),
      (err) => {
        setListening(false);
        if (err) notify(err, 'err');
      },
    );
    if (!r) return notify('La dictée n’est pas disponible sur ce navigateur.', 'err');
    rec.current = r;
    setListening(true);
  };

  const applyDictation = () => {
    const r = parseDictation(heard, services, clients);
    if (r.clientId) {
      const c = clients.find((x) => x.id === r.clientId)!;
      setClientId(c.id);
      setAddress(c.address);
      setAddressGeo(c.geo);
    }
    r.lines.forEach((l) => addCode(l.code, l.quantity));
    const parts = [r.clientName && `client: ${r.clientName}`, r.lines.length && `${r.lines.length} ligne(s)`].filter(Boolean).join(' · ');
    notify(parts ? `Compris — ${parts}` : 'Je n’ai reconnu aucun code. Réessaie ou choisis à la main.', parts ? 'ok' : 'err');
    if (r.leftovers.length) setTimeout(() => notify(`Pas compris: « ${r.leftovers.join(' / ')} »`, 'err'), 3200);
    setHeard('');
    setStep(r.clientId || clientId ? 1 : 0);
  };

  const create = async (then: 'share' | 'mail' | 'none') => {
    if (!lines.length) return notify('Ajoute au moins un code.', 'err');
    setBusy(true);
    try {
      const st = await getSettings();
      let cid = clientId;
      if (!cid && newClient?.name.trim()) {
        cid = await db.clients.add({ name: newClient.name.trim(), contact: '', email: newClient.email, phone: newClient.phone, address: newClient.address, geo: newClient.geo, notes: '', createdAt: new Date().toISOString() });
      }
      if (!cid) {
        setBusy(false);
        setStep(0);
        return notify('Choisis un client.', 'err');
      }
      const now = new Date().toISOString();
      const date = todayISO();
      const t = docTotals(fake, st);
      // Job prévu aujourd'hui pour ce client: on le relie (km comptés dans la route du jour)
      const job = (await db.jobs.where('date').equals(date).toArray()).find((j) => j.clientId === cid && !j.docId && j.status !== 'annule');
      const doc: Doc = {
        type: 'invoice',
        number: await takeNextNumber('invoice'),
        clientId: cid,
        date,
        dueDate: addDays(date, st.paymentTermsDays),
        jobDate: date,
        jobAddress: address,
        jobGeo: addressGeo,
        title: title.trim() || lines.map((l) => l.description).join(', ').slice(0, 80),
        items: lines,
        applyTps: st.chargeTaxes,
        applyTvq: st.chargeTaxes,
        discount: discount || undefined,
        notes: st.invoiceNotes,
        status: paidNow ? 'paid' : 'draft',
        payments: paidNow ? [{ date, amount: t.total, method: payMethod, mediaId: proofId }] : [],
        jobId: job?.id,
        createdAt: now,
        updatedAt: now,
      };
      const id = await db.docs.add(doc);
      if (proofId) await db.media.update(proofId, { docId: id });
      let tripKm: number | undefined;
      try {
        if (job?.id) {
          await db.jobs.update(job.id, { docId: id, status: 'facture', doneAt: job.doneAt ?? now });
          const media = await db.media.where('jobId').equals(job.id).toArray();
          await Promise.all(media.map((m) => db.media.update(m.id!, { docId: id })));
          const legs = await syncDayRoute(date);
          tripKm = legs.reduce((a, l) => a + l.totalKm, 0) || undefined;
        } else tripKm = (await syncTripForDoc(id))?.totalKm;
      } catch {
        /* km plus tard */
      }
      const saved = (await db.docs.get(id))!;
      const c = await db.clients.get(cid);
      setCreated({ doc: saved, client: c, trip: tripKm });
      if (then === 'share') await share(saved, c);
      if (then === 'mail') setMailPdf(await makeDocPdf(saved, c, st));
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const share = async (d: Doc, c?: Client) => {
    const blob = await makeDocPdf(d, c, await getSettings());
    if (await shareFiles([{ blob, name: docFileName(d, c) }], `Facture ${d.number}`, `Facture ${d.number} — ${s.companyName}`)) {
      if (d.status === 'draft') await db.docs.update(d.id!, { status: 'sent', sentAt: new Date().toISOString() });
    } else downloadBlob(blob, docFileName(d, c));
  };

  // ---------- Écran final ----------
  if (created) {
    const t = docTotals(created.doc, s);
    return (
      <div className="express">
        <div className="card" style={{ textAlign: 'center', padding: 28 }}>
          <CircleCheck size={56} color="var(--green)" />
          <h1 style={{ marginTop: 10 }}>Facture {created.doc.number}</h1>
          <div className="muted">{created.client?.name}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2.2rem', margin: '10px 0' }}>{money(t.total)}</div>
          {created.doc.status === 'paid' && <span className="badge green">Payée — {created.doc.payments[0]?.method}</span>}
          {created.trip !== undefined && <div className="small muted" style={{ marginTop: 8 }}>{created.doc.jobId ? `Route du jour: ${km(created.trip)} au journal de bord` : `${km(created.trip)} ajoutés au journal de bord`}</div>}
        </div>
        <div className="grid" style={{ gap: 8 }}>
          <button className="btn accent big block" onClick={() => share(created.doc, created.client)}><Share2 size={20} /> Partager le PDF (texto, courriel…)</button>
          <button className="btn big block" onClick={async () => setMailPdf(await makeDocPdf(created.doc, created.client, s))}><Mail size={20} /> Envoyer par Gmail</button>
          {s.cardPayments && created.doc.status !== 'paid' && (
            <button className="btn primary big block" onClick={async () => {
              try {
                const link = await publishPortal(created.doc.id!);
                location.href = link; // le client paie sur ton téléphone
              } catch (e) {
                notify(errMsg(e), 'err');
              }
            }}><CreditCard size={20} /> Faire payer par carte maintenant</button>
          )}
          <Link className="btn big block" to={`/doc/${created.doc.id}`}><FileText size={20} /> Ouvrir la facture</Link>
        </div>
        <div style={{ marginTop: 16 }}>
          <MediaGallery link={{ docId: created.doc.id, clientId: created.doc.clientId }} kinds={['avant', 'apres', 'job']} title="Photos du job (avant / après)" />
        </div>
        <button className="btn ghost block" onClick={() => { setCreated(null); setLines([]); setClientId(undefined); setNewClient(null); setStep(0); setPaidNow(false); setProofId(undefined); setDiscount(0); setTitle(''); }}>
          <Zap size={17} /> Nouvelle facture express
        </button>
        {mailPdf && (
          <SendEmailModal
            title={`Envoyer la facture ${created.doc.number}`}
            to={created.client?.email ?? ''}
            subject={`Facture ${created.doc.number} — ${s.companyName}`}
            body={`Bonjour ${created.client?.contact || created.client?.name || ''},\n\nVoici la facture ${created.doc.number} au montant de ${money(t.balance || t.total)}.\n\n${s.paymentInstructions}\n\nMerci!\n${s.emailSignature}`}
            attachments={[{ filename: docFileName(created.doc, created.client), mimeType: 'application/pdf', blob: mailPdf }]}
            onClose={() => setMailPdf(null)}
            onSent={async ({ gmailId, to, subject }) => {
              await db.emails.add({ date: new Date().toISOString(), to, subject, clientId: created.doc.clientId, docId: created.doc.id, gmailId, kind: 'facture' });
              if (created.doc.status === 'draft') await db.docs.update(created.doc.id!, { status: 'sent', sentAt: new Date().toISOString() });
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="express">
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow"><Zap size={14} /> Facture express</div>
          <h1>{STEPS[step]}</h1>
        </div>
        {speechSupported() && (
          <button className={`mic ${listening ? 'on' : ''}`} onClick={startMic} aria-label={listening ? 'Arrêter la dictée' : 'Dicter la facture'}>
            {listening ? <MicOff size={26} /> : <Mic size={26} />}
          </button>
        )}
      </div>
      <div className="steps">{STEPS.map((x, i) => <span key={x} className={i <= step ? 'on' : ''} />)}</div>

      {(listening || heard) && (
        <div className="card">
          <div className="small muted">{listening ? 'J’écoute… ex.: « NDG 120 pieds et lavage de vitres 12 fenêtres chez Tremblay »' : 'Dictée'}</div>
          <div style={{ fontSize: '1.1rem', margin: '6px 0 10px' }}>{heard || '…'}</div>
          {!listening && heard && (
            <div className="row">
              <button className="btn accent" onClick={applyDictation}><Check size={17} /> Utiliser</button>
              <button className="btn" onClick={() => setHeard('')}>Effacer</button>
            </div>
          )}
        </div>
      )}

      {step === 0 && (
        <>
          <div className="row" style={{ flexWrap: 'nowrap', marginBottom: 10 }}>
            <div className="addr" style={{ position: 'relative' }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un client (nom, tél., adresse)" aria-label="Chercher un client" />
            </div>
            <button className="btn icon-btn" aria-label="Chercher"><Search size={18} /></button>
          </div>
          {!newClient ? (
            <div className="big-list">
              <button className="big-item" onClick={() => setNewClient({ name: q, phone: '', email: '', address: '' })}>
                <UserPlus size={22} /><div className="grow"><div className="t">Nouveau client{q ? ` « ${q} »` : ''}</div></div>
              </button>
              {shown.map((c) => (
                <button key={c.id} className={`big-item ${c.id === clientId ? 'on' : ''}`} onClick={() => pickClient(c)}>
                  <div className="grow">
                    <div className="t">{c.name}</div>
                    <div className="small muted">{c.address || c.phone}</div>
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <div className="card">
              <div className="form-grid">
                <label className="field full">Nom *<input autoFocus value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} /></label>
                <label className="field">Téléphone<input type="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} /></label>
                <label className="field">Courriel<input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} /></label>
                <label className="field full">Adresse
                  <AddressInput value={newClient.address} onChange={(v) => setNewClient({ ...newClient, address: v, geo: undefined })} onPick={(label, geo) => setNewClient({ ...newClient, address: label, geo })} />
                </label>
              </div>
              <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setNewClient(null)}>Annuler</button>
                <button className="btn accent" disabled={!newClient.name.trim()} onClick={() => { setClientId(undefined); setAddress(newClient.address); setAddressGeo(newClient.geo); setStep(1); }}>Continuer <ArrowRight size={17} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <div className="small muted" style={{ marginBottom: 8 }}>{client?.name ?? newClient?.name} — touche un code pour l’ajouter</div>
          <div className="code-tiles">
            {services.map((sv) => {
              const line = lines.find((l) => l.code === sv.code);
              return (
                <button key={sv.id} className={`code-tile ${line ? 'on' : ''}`} onClick={() => addCode(sv.code)}>
                  {line && <span className="count">{line.quantity}</span>}
                  <b>{sv.code}</b>
                  <span className="n">{sv.name}</span>
                  <span className="p">{money(sv.price)} / {sv.unit}</span>
                </button>
              );
            })}
          </div>
          {lines.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              {lines.map((l, i) => (
                <div key={l.code ?? i} className="qty-row">
                  <div style={{ minWidth: 0 }}>
                    <div><b style={{ color: 'var(--amber-ink)', fontFamily: 'var(--font-display)' }}>{l.code}</b> {l.description}</div>
                    <div className="small muted">{money(l.unitPrice)} / {l.unit} = <strong>{money(lineAmount(l))}</strong>{l.minimum && l.quantity * l.unitPrice < l.minimum ? ` (minimum ${money(l.minimum)})` : ''}</div>
                  </div>
                  <div className="stepper">
                    <button className="btn" onClick={() => setQty(i, round2(l.quantity - (l.quantity > 20 ? 10 : 1)))} aria-label="Moins"><Minus size={18} /></button>
                    <NumInput value={l.quantity} onChange={(n) => setQty(i, n)} aria-label={`Quantité ${l.code}`} />
                    <button className="btn" onClick={() => setQty(i, round2(l.quantity + (l.quantity >= 20 ? 10 : 1)))} aria-label="Plus"><Plus size={18} /></button>
                    <button className="btn" onClick={() => setCalcFor(i)} aria-label="Calculateur"><Calculator size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <div className="card">
          <div className="form-grid">
            <label className="field full">Description (optionnel)<input value={title} placeholder={lines.map((l) => l.description).join(', ')} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="field full">Lieu des travaux
              <AddressInput value={address} onChange={(v) => { setAddress(v); setAddressGeo(undefined); }} onPick={(label, geo) => { setAddress(label); setAddressGeo(geo); }} />
            </label>
            <label className="field">Rabais ($)<NumInput value={discount} placeholder="0" onChange={(n) => setDiscount(n)} /></label>
          </div>
          <label className="check" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} /> <Banknote size={17} /> Le client a payé sur place
          </label>
          {paidNow && (
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              <div className="seg">{PAY_METHODS.map((m) => <button key={m} className={payMethod === m ? 'on' : ''} onClick={() => setPayMethod(m)}>{m}</button>)}</div>
              <ProofPhoto mediaId={proofId} onChange={setProofId} link={{ clientId: clientId }} label={payMethod === 'Comptant' ? 'Photo de l’argent reçu' : 'Photo de preuve'} />
            </div>
          )}
        </div>
      )}

      <div className="express-total">
        {step > 0 && <button className="btn icon-btn" style={{ background: 'transparent', color: 'inherit', borderColor: 'var(--brand-2)' }} onClick={() => setStep(step - 1)} aria-label="Retour"><ArrowLeft size={18} /></button>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="small" style={{ opacity: 0.7 }}>{lines.length} ligne{lines.length > 1 ? 's' : ''}{tot.discount ? ` · rabais ${money(tot.discount)}` : ''}</div>
          <div className="amt">{money(tot.total)}</div>
        </div>
        {step === 0 && <button className="btn accent" disabled={!clientId} onClick={() => setStep(1)}>Codes <ArrowRight size={17} /></button>}
        {step === 1 && <button className="btn accent" disabled={!lines.length} onClick={() => setStep(2)}>Finaliser <ArrowRight size={17} /></button>}
        {step === 2 && (
          <>
            <button className="btn" disabled={busy} onClick={() => create('none')} style={{ background: 'transparent', color: 'inherit', borderColor: 'var(--brand-2)' }}>Créer</button>
            <button className="btn accent" disabled={busy} onClick={() => create('share')}><Share2 size={17} /> {busy ? '…' : 'Créer et partager'}</button>
          </>
        )}
      </div>
      {step === 2 && <div className="small muted" style={{ textAlign: 'center', marginTop: 8 }}><button className="btn ghost small" onClick={() => create('mail')}>ou créer et envoyer par Gmail</button> · <button className="btn ghost small" onClick={() => nav('/doc/new?type=invoice')}>formulaire complet</button></div>}

      {calcFor !== null && lines[calcFor] && (
        <CalcModal line={lines[calcFor]} onClose={() => setCalcFor(null)} onApply={(qty, calc) => { setLines((ls) => ls.map((l, j) => (j === calcFor ? { ...l, quantity: qty, calc } : l))); setCalcFor(null); }} />
      )}
    </div>
  );
}
