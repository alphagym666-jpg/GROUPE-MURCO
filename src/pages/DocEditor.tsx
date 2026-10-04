import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AddressInput } from '../components/AddressInput';
import { ClientFormModal } from '../components/ClientForm';
import { emptyLine, LineItems } from '../components/LineItems';
import { Modal } from '../components/Modal';
import { SendEmailModal } from '../components/SendEmailModal';
import { errMsg, useConfirm, useToast } from '../components/Toast';
import { db, getSettings, takeNextNumber, type Doc, type DocStatus, type DocType } from '../lib/db';
import { directionsLink, embedDirectionsUrl } from '../lib/geo';
import { useSettings } from '../lib/hooks';
import { docFileName } from '../lib/pdf';
import { makeDocPdf } from '../lib/docPdf';
import { isNative, shareFiles, shareLink } from '../lib/native';
import { publishPortal } from '../lib/portal';
import { profitOfDoc } from '../lib/profit';
import { useSyncState } from '../lib/sync';
import { smsLink } from '../lib/agenda';
import { MediaGallery, ProofPhoto } from '../components/MediaGallery';
import { Banknote, Copy, Download, Eye, Link2, Plus, Save, Send, Share2, Trash2, Navigation, RefreshCw, TrendingUp } from 'lucide-react';
import { deleteDocCascade, syncTripForDoc } from '../lib/trips';
import { addDays, METHOD_LABEL, docTotals, downloadBlob, formatDate, km, money, round2, STATUS_LABELS, statusClass, statusLabel, todayISO } from '../lib/utils';

function newDoc(type: DocType, clientId: number, s: Awaited<ReturnType<typeof getSettings>>): Doc {
  const date = todayISO();
  const now = new Date().toISOString();
  return {
    type,
    number: '',
    clientId,
    date,
    dueDate: addDays(date, type === 'invoice' ? s.paymentTermsDays : s.quoteValidityDays),
    jobDate: type === 'invoice' ? date : '',
    jobAddress: '',
    title: '',
    items: [emptyLine()],
    applyTps: s.chargeTaxes,
    applyTvq: s.chargeTaxes,
    notes: type === 'invoice' ? s.invoiceNotes : s.quoteNotes,
    status: 'draft',
    payments: [],
    createdAt: now,
    updatedAt: now,
  };
}

export default function DocEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const notify = useToast();
  const ask = useConfirm();
  const s = useSettings();
  const isNew = id === 'new';

  const [doc, setDoc] = useState<Doc | null>(null);
  const [savedAddress, setSavedAddress] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showClient, setShowClient] = useState(false);
  const [emailPdf, setEmailPdf] = useState<Blob | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? [];
  const services = useLiveQuery(() => db.services.orderBy('order').toArray(), []) ?? [];
  const trip = useLiveQuery(() => (doc?.tripId ? db.trips.get(doc.tripId) : undefined), [doc?.tripId]);
  const emails = useLiveQuery(() => (doc?.id ? db.emails.where('docId').equals(doc.id).toArray() : []), [doc?.id]) ?? [];
  const linked = useLiveQuery(async () => {
    if (!doc) return {};
    const src = doc.sourceQuoteId ? await db.docs.get(doc.sourceQuoteId) : undefined;
    const conv = doc.convertedInvoiceId ? await db.docs.get(doc.convertedInvoiceId) : undefined;
    return { src, conv };
  }, [doc?.sourceQuoteId, doc?.convertedInvoiceId]);

  useEffect(() => {
    (async () => {
      if (isNew) {
        const st = await getSettings();
        const type = (params.get('type') as DocType) || 'invoice';
        setDoc(newDoc(type, Number(params.get('client')) || 0, st));
        setSavedAddress('');
        setDirty(false);
      } else {
        const d = await db.docs.get(Number(id));
        if (!d) return nav('/factures');
        setDoc(d);
        setSavedAddress(d.jobAddress);
        setDirty(false);
      }
    })();
  }, [id, isNew, params, nav]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  // Mises à jour venant d'ailleurs (autre appareil, signature du client dans le portail)
  const live = useLiveQuery(() => (doc?.id ? db.docs.get(doc.id) : undefined), [doc?.id]);
  useEffect(() => {
    if (!live || !doc || live._u === doc._u) return;
    if (!dirty) setDoc(live);
    else setDoc((d) => (d ? { ...d, signature: live.signature, viewedAt: live.viewedAt, portalToken: live.portalToken, _u: live._u } : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?._u]);

  if (!doc) return null;
  const client = clients.find((c) => c.id === doc.clientId);
  const tot = docTotals(doc, s);
  const isInvoice = doc.type === 'invoice';
  const kind = isInvoice ? 'Facture' : 'Soumission';

  const upd = (patch: Partial<Doc>) => {
    setDoc((d) => ({ ...d!, ...patch }));
    setDirty(true);
  };

  /** Enregistre et retourne la version à jour (avec id et numéro). */
  const save = async (extra: Partial<Doc> = {}, quiet = false): Promise<Doc | null> => {
    if (!doc.clientId) {
      notify('Choisis un client.', 'err');
      return null;
    }
    setBusy(true);
    try {
      const toSave: Doc = {
        ...doc,
        ...extra,
        items: doc.items.filter((it) => it.description.trim() || it.unitPrice || it.code),
        updatedAt: new Date().toISOString(),
      };
      if (!toSave.items.length) toSave.items = [emptyLine()];
      if (!toSave.number) toSave.number = await takeNextNumber(toSave.type);
      if (toSave.jobAddress.trim() !== savedAddress.trim()) toSave.jobGeo = undefined;
      const newId = await db.docs.put(toSave);
      let saved = { ...toSave, id: newId };
      setSavedAddress(saved.jobAddress);
      try {
        const t = await syncTripForDoc(newId);
        if (t) {
          saved = { ...saved, tripId: t.id, jobGeo: (await db.docs.get(newId))?.jobGeo };
          if (!quiet) notify(`${kind} enregistrée · journal de bord: ${km(t.totalKm)}`);
        } else if (!quiet) notify(`${kind} enregistrée`);
      } catch (e) {
        notify(`${kind} enregistrée, mais km non calculés: ${errMsg(e)}`, 'err');
      }
      setDoc(saved);
      setDirty(false);
      if (isNew) nav(`/doc/${newId}`, { replace: true });
      return saved;
    } catch (e) {
      notify(errMsg(e), 'err');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pdfBlob = (d: Doc) => makeDocPdf(d, client, s);
  const ready = async () => (dirty || !doc.id ? await save({}, true) : doc);

  const preview = async () => {
    const d = await ready();
    if (d) setPdfUrl(URL.createObjectURL(await pdfBlob(d)));
  };
  const download = async () => {
    const d = await ready();
    if (d) downloadBlob(await pdfBlob(d), docFileName(d, client));
  };
  const openEmail = async () => {
    const d = await ready();
    if (d) setEmailPdf(await pdfBlob(d));
  };
  /** Partage du PDF (texto, Messenger, courriel…) avec la feuille de partage du téléphone. */
  const share = async () => {
    const d = await ready();
    if (!d) return;
    const blob = await pdfBlob(d);
    const ok = await shareFiles([{ blob, name: docFileName(d, client) }], `${kind} ${d.number}`, `${kind} ${d.number} — ${s.companyName} — ${money(docTotals(d, s).balance || docTotals(d, s).total)}`);
    if (ok) {
      if (d.status === 'draft') await save({ status: 'sent', sentAt: new Date().toISOString() }, true);
    } else {
      downloadBlob(blob, docFileName(d, client));
      notify('PDF téléchargé (le partage direct n’est pas disponible sur cet appareil).');
    }
  };

  const setStatus = async (status: DocStatus) => {
    await save({ status });
  };

  const convertToInvoice = async () => {
    const q = dirty || !doc.id ? await save({}, true) : doc;
    if (!q?.id) return;
    const st = await getSettings();
    const inv: Doc = {
      ...newDoc('invoice', q.clientId, st),
      title: q.title,
      jobAddress: q.jobAddress,
      jobGeo: q.jobGeo,
      items: q.items.map((it) => ({ ...it })),
      applyTps: q.applyTps,
      applyTvq: q.applyTvq,
      discount: q.discount,
      sourceQuoteId: q.id,
    };
    inv.number = await takeNextNumber('invoice');
    const invId = await db.docs.add(inv);
    await db.docs.update(q.id, { status: 'accepted', convertedInvoiceId: invId, updatedAt: new Date().toISOString() });
    try {
      await syncTripForDoc(invId);
    } catch (e) {
      notify(`Facture créée, km non calculés: ${errMsg(e)}`, 'err');
    }
    notify(`Facture ${inv.number} créée à partir de la soumission`);
    nav(`/doc/${invId}`);
  };

  const duplicate = async () => {
    const st = await getSettings();
    const copy: Doc = { ...newDoc(doc.type, doc.clientId, st), title: doc.title, jobAddress: doc.jobAddress, items: doc.items.map((i) => ({ ...i })), applyTps: doc.applyTps, applyTvq: doc.applyTvq, discount: doc.discount, notes: doc.notes };
    copy.number = await takeNextNumber(copy.type);
    const nid = await db.docs.add(copy);
    notify(`Copie ${copy.number} créée`);
    nav(`/doc/${nid}`);
  };

  const remove = async () => {
    if (!doc.id) return nav(-1);
    if (!(await ask({ title: `Supprimer ${kind.toLowerCase()} ${doc.number}?`, message: 'Le déplacement automatique lié sera aussi supprimé.', confirm: 'Supprimer', danger: true }))) return;
    await deleteDocCascade(doc.id);
    notify(`${kind} supprimée`);
    nav(isInvoice ? '/factures' : '/soumissions');
  };

  const recalcTrip = async () => {
    const d = dirty || !doc.id ? await save({}, true) : doc;
    if (!d?.id) return;
    try {
      if (trip?.id && trip.distanceMethod === 'manuel') await db.trips.update(trip.id, { distanceMethod: 'route', toGeo: undefined });
      const t = await syncTripForDoc(d.id, { force: true });
      if (t) {
        setDoc({ ...d, tripId: t.id });
        notify(`Déplacement: ${km(t.totalKm)} (${t.roundTrip ? 'aller-retour' : 'aller'})`);
      } else notify('Ajoute l’adresse de la job ou du client.', 'err');
    } catch (e) {
      notify(errMsg(e), 'err');
    }
  };

  const emailBody = () => {
    const hello = `Bonjour ${client?.contact || client?.name || ''},`;
    const lines = isInvoice
      ? [
          hello,
          '',
          `Vous trouverez ci-joint la facture ${doc.number}${doc.title ? ` pour « ${doc.title} »` : ''}, au montant de ${money(tot.balance)}.`,
          `Date d’échéance: ${formatDate(doc.dueDate)}.`,
          '',
          s.paymentInstructions,
        ]
      : [
          hello,
          '',
          `Tel que discuté, voici notre soumission ${doc.number}${doc.title ? ` pour « ${doc.title} »` : ''}, au montant de ${money(tot.total)} (taxes incluses).`,
          `Elle est valide jusqu’au ${formatDate(doc.dueDate)}.`,
          '',
          'N’hésitez pas à me contacter pour toute question.',
        ];
    return [...lines, '', 'Merci et bonne journée!', '', s.emailSignature || s.companyName, s.phone].filter((x) => x !== undefined).join('\n');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small muted"><Link to={isInvoice ? '/factures' : '/soumissions'}>← {isInvoice ? 'Factures' : 'Soumissions'}</Link></div>
          <h1>
            {kind} {doc.number || '(nouvelle)'} {doc.id && <span className={statusClass(doc)} style={{ verticalAlign: 'middle' }}>{statusLabel(doc)}</span>}
          </h1>
        </div>
        <div className="actions">
          <button className="btn accent" onClick={() => save()} disabled={busy}><Save size={17} /> {busy ? '…' : 'Enregistrer'}</button>
          <button className="btn" onClick={preview}><Eye size={17} /> Aperçu</button>
          <button className="btn" onClick={download}><Download size={17} /> PDF</button>
          <button className="btn" onClick={share}><Share2 size={17} /> Partager</button>
          <button className="btn primary" onClick={openEmail}><Send size={17} /> Envoyer</button>
          {doc.id && <PortalButton doc={doc} />}
        </div>
      </div>

      {linked?.src && <div className="notice info">Créée à partir de la soumission <Link to={`/doc/${linked.src.id}`}>{linked.src.number}</Link>.</div>}
      {doc.signature && <div className="notice ok">Acceptée en ligne par <strong>{doc.signature.name}</strong> le {new Date(doc.signature.at).toLocaleString('fr-CA')}{doc.type === 'quote' && !doc.convertedInvoiceId ? ' — crée la facture quand les travaux sont faits.' : ''}</div>}
      {!doc.signature && doc.viewedAt && <div className="notice info">Le client a ouvert le lien le {new Date(doc.viewedAt).toLocaleString('fr-CA')}.</div>}
      {linked?.conv && <div className="notice ok">Convertie en facture <Link to={`/doc/${linked.conv.id}`}>{linked.conv.number}</Link>.</div>}

      <div className="card">
        <div className="form-grid">
          <label className="field full">
            Client *
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select value={doc.clientId || ''} onChange={(e) => upd({ clientId: Number(e.target.value) })}>
                <option value="">— Choisir un client —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn" onClick={() => setShowClient(true)}>+ Nouveau</button>
            </div>
          </label>
          <label className="field">Date<input type="date" value={doc.date} onChange={(e) => upd({ date: e.target.value })} /></label>
          <label className="field">{isInvoice ? 'Échéance' : 'Valide jusqu’au'}<input type="date" value={doc.dueDate} onChange={(e) => upd({ dueDate: e.target.value })} /></label>
          <label className="field">Date des travaux<input type="date" value={doc.jobDate} onChange={(e) => upd({ jobDate: e.target.value })} /></label>
          <label className="field">
            Statut
            <select value={doc.status} onChange={(e) => upd({ status: e.target.value as DocStatus })}>
              {(isInvoice ? ['draft', 'sent', 'partial', 'paid', 'cancelled'] : ['draft', 'sent', 'accepted', 'refused', 'cancelled']).map((k) => (
                <option key={k} value={k}>{STATUS_LABELS[k as DocStatus]}</option>
              ))}
            </select>
          </label>
          <label className="field full">Description de la job (sert aussi de raison dans le journal de bord)
            <input value={doc.title} placeholder="ex.: Installation de céramique salle de bain" onChange={(e) => upd({ title: e.target.value })} />
          </label>
          <label className="field full">
            Lieu des travaux
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <AddressInput value={doc.jobAddress} placeholder="ex.: 123 rue Principale, Laval, QC" onChange={(v) => upd({ jobAddress: v })} onPick={(label, geo) => { setDoc((d) => ({ ...d!, jobAddress: label, jobGeo: geo })); setSavedAddress(label); setDirty(true); }} />
              {client?.address && <button className="btn" onClick={() => { setDoc((d) => ({ ...d!, jobAddress: client.address, jobGeo: client.geo })); setSavedAddress(client.geo ? client.address : ''); setDirty(true); }} title="Adresse du client">= client</button>}
            </div>
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Détails</h2>
        <LineItems items={doc.items} services={services} onChange={(items) => upd({ items })} />
        <div className="grid two" style={{ marginTop: 16, alignItems: 'start' }}>
          <div className="form-grid">
            <label className="field">Rabais ($, avant taxes)<input type="number" inputMode="decimal" step="0.01" value={doc.discount || ''} placeholder="0" onChange={(e) => upd({ discount: Number(e.target.value) })} /></label>
            <label className="field">Dépôt reçu ($)<input type="number" inputMode="decimal" step="0.01" value={doc.deposit || ''} placeholder="0" onChange={(e) => upd({ deposit: Number(e.target.value) })} /></label>
            {(doc.deposit ?? 0) > 0 && (
              <div className="full">
                {doc.id
                  ? <ProofPhoto mediaId={doc.depositMediaId} link={{ docId: doc.id, clientId: doc.clientId }} label="Photo du dépôt (comptant / bordereau)" onChange={(id) => upd({ depositMediaId: id })} />
                  : <span className="small muted">Enregistre pour ajouter la photo du dépôt.</span>}
              </div>
            )}
            <label className="check"><input type="checkbox" checked={doc.applyTps} onChange={(e) => upd({ applyTps: e.target.checked })} /> TPS {s.tpsRate} %</label>
            <label className="check"><input type="checkbox" checked={doc.applyTvq} onChange={(e) => upd({ applyTvq: e.target.checked })} /> TVQ {s.tvqRate} %</label>
          </div>
          <div className="totals">
            {tot.discount > 0 && <div><span>Sous-total</span><span>{money(tot.lines)}</span></div>}
            {tot.discount > 0 && <div><span>Rabais</span><span>−{money(tot.discount)}</span></div>}
            {(tot.discount > 0 || doc.applyTps || doc.applyTvq) && <div><span>{tot.discount > 0 ? 'Après rabais' : 'Sous-total'}</span><span>{money(tot.subtotal)}</span></div>}
            {doc.applyTps && <div><span>TPS</span><span>{money(tot.tps)}</span></div>}
            {doc.applyTvq && <div><span>TVQ</span><span>{money(tot.tvq)}</span></div>}
            <div className="grand"><span>Total</span><span>{money(tot.total)}</span></div>
            {tot.deposit > 0 && <div><span>Dépôt reçu</span><span>−{money(tot.deposit)}</span></div>}
            {tot.paid - tot.deposit > 0 && <div><span>Paiements reçus</span><span>−{money(tot.paid - tot.deposit)}</span></div>}
            {tot.paid > 0 && <div className="grand"><span>Solde à payer</span><span>{money(tot.balance)}</span></div>}
          </div>
        </div>
        <label className="field" style={{ marginTop: 12 }}>Notes (apparaissent sur le PDF)<textarea value={doc.notes} onChange={(e) => upd({ notes: e.target.value })} /></label>
      </div>

      {doc.id && isInvoice && <ProfitCard doc={doc} onChange={(p) => upd(p)} />}

      {doc.id ? (
        <>
          <MediaGallery link={{ docId: doc.id, jobId: doc.jobId, clientId: doc.clientId }} kinds={['avant', 'apres', 'job']} title="Photos des travaux" />
          <label className="check" style={{ margin: '-6px 0 16px 4px' }}>
            <input type="checkbox" checked={!!doc.pdfPhotos} onChange={(e) => { upd({ pdfPhotos: e.target.checked }); }} /> Joindre les photos avant/après au PDF
          </label>
        </>
      ) : null}

      <div className="grid two">
        <div className="card">
          <h2>Déplacement (journal de bord)</h2>
          {trip ? (
            <>
              <div><strong>{km(trip.totalKm)}</strong> {trip.roundTrip ? '(aller-retour)' : '(aller)'} — {trip.date}</div>
              <div className="small muted">De: {trip.fromLabel}<br />À: {trip.toLabel}<br />Raison: {trip.reason}</div>
              <div className="small muted">{METHOD_LABEL[trip.distanceMethod]}{trip.durationMin ? ` · ≈ ${trip.durationMin} min de route` : ''}</div>
              {s.googleMapsKey && <iframe className="map-embed" title="Trajet" loading="lazy" src={embedDirectionsUrl(s.googleMapsKey, trip.fromGeo ?? trip.fromLabel, trip.toGeo ?? trip.toLabel)} />}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn small" onClick={recalcTrip}><RefreshCw size={15} /> Recalculer</button>
                <a className="btn small" href={directionsLink(trip.fromGeo ?? trip.fromLabel, trip.toGeo ?? trip.toLabel)} target="_blank" rel="noreferrer"><Navigation size={15} /> Ouvrir dans Google Maps</a>
                <Link className="btn small" to="/km">Journal →</Link>
              </div>
            </>
          ) : (
            <>
              <div className="muted small">
                {doc.jobId
                  ? <>Compté dans la route de la journée du {doc.jobDate} (domicile → jobs → domicile). <Link to={`/agenda?d=${doc.jobDate}`}>Voir l’agenda</Link></>
                  : isInvoice && s.autoTripFromInvoices
                    ? 'Le trajet domicile → lieu des travaux sera ajouté automatiquement au journal de bord à l’enregistrement.'
                    : 'Aucun déplacement lié.'}
              </div>
              {!doc.jobId && <button className="btn small" style={{ marginTop: 8 }} onClick={recalcTrip}>+ Ajouter le déplacement maintenant</button>}
            </>
          )}
        </div>

        <div className="card">
          <h2>Actions</h2>
          <div className="row">
            {isInvoice && doc.id && doc.status !== 'paid' && <button className="btn accent" onClick={() => setShowPay(true)}><Banknote size={17} /> Enregistrer un paiement</button>}
            {!isInvoice && doc.id && !doc.convertedInvoiceId && <button className="btn accent" onClick={convertToInvoice}>Acceptée → créer la facture</button>}
            {!isInvoice && doc.id && doc.status !== 'refused' && !doc.convertedInvoiceId && <button className="btn" onClick={() => setStatus('refused')}>Refusée</button>}
            {doc.id && <button className="btn" onClick={duplicate}><Copy size={16} /> Dupliquer</button>}
            <button className="btn danger" onClick={remove}><Trash2 size={16} /> Supprimer</button>
          </div>
          {isInvoice && doc.payments.length > 0 && (
            <table className="list" style={{ marginTop: 12 }}>
              <tbody>
                {doc.payments.map((p, i) => (
                  <tr key={i}>
                    <td>{p.date}</td><td>{p.method}{p.note ? <div className="small muted">{p.note}</div> : null}</td>
                    <td><ProofPhoto mediaId={p.mediaId} link={{ docId: doc.id, clientId: doc.clientId }} label="Preuve" onChange={(mediaId) => save({ payments: doc.payments.map((x, j) => (j === i ? { ...x, mediaId } : x)) }, true)} /></td>
                    <td className="num">{money(p.amount)}</td>
                    <td><button className="btn small danger" onClick={() => { const payments = doc.payments.filter((_, j) => j !== i); const tt = docTotals({ ...doc, payments }, s); save({ payments, status: tt.paid <= 0 ? 'sent' : tt.balance > 0 ? 'partial' : 'paid' }); }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {emails.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3>Courriels envoyés</h3>
              {emails.map((e) => <div key={e.id} className="small">{new Date(e.date).toLocaleString('fr-CA')} → {e.to}</div>)}
            </div>
          )}
        </div>
      </div>

      {showClient && <ClientFormModal onClose={() => setShowClient(false)} onSaved={(cid) => upd({ clientId: cid })} />}

      {emailPdf && doc.id && (
        <SendEmailModal
          title={`Envoyer ${kind.toLowerCase()} ${doc.number}`}
          to={client?.email ?? ''}
          subject={`${kind} ${doc.number} — ${s.companyName}`}
          body={emailBody()}
          attachments={[{ filename: docFileName(doc, client), mimeType: 'application/pdf', blob: emailPdf }]}
          onClose={() => setEmailPdf(null)}
          onSent={async ({ gmailId, to, subject }) => {
            await db.emails.add({ date: new Date().toISOString(), to, subject, clientId: doc.clientId, docId: doc.id, gmailId, kind: isInvoice ? 'facture' : 'soumission' });
            if (doc.status === 'draft') {
              await db.docs.update(doc.id!, { status: 'sent', sentAt: new Date().toISOString() });
              setDoc({ ...doc, status: 'sent', sentAt: new Date().toISOString() });
            }
          }}
        />
      )}

      {showPay && <PaymentModal balance={tot.balance} link={{ docId: doc.id, clientId: doc.clientId }} onClose={() => setShowPay(false)} onSave={(p) => {
        const payments = [...doc.payments, p];
        const tt = docTotals({ ...doc, payments }, s);
        save({ payments, status: tt.balance <= 0.004 ? 'paid' : 'partial' });
        setShowPay(false);
      }} />}

      {pdfUrl && (
        <Modal title="Aperçu" onClose={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }}>
          <iframe src={pdfUrl} title="Aperçu PDF" style={{ width: '100%', height: '70vh', border: 0 }} />
          <div className="small muted">Sur mobile, si l’aperçu ne s’affiche pas, utilise « ⬇ PDF ».</div>
        </Modal>
      )}
    </>
  );
}

function PaymentModal({ balance, link, onClose, onSave }: { balance: number; link: { docId?: number; clientId?: number }; onClose: () => void; onSave: (p: Doc['payments'][number]) => void }) {
  const [amount, setAmount] = useState(balance);
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('Virement Interac');
  const [mediaId, setMediaId] = useState<number>();
  const [note, setNote] = useState('');
  return (
    <Modal title="Enregistrer un paiement" onClose={onClose}>
      <div className="form-grid">
        <label className="field">Montant<input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
        <label className="field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field full">Mode
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {['Virement Interac', 'Comptant', 'Chèque', 'Dépôt au comptoir', 'Carte de crédit', 'Dépôt direct', 'Autre'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="field full">Note (optionnel)<input value={note} placeholder="ex.: payé en argent sur place" onChange={(e) => setNote(e.target.value)} /></label>
        <div className="full">
          <div className="small muted" style={{ marginBottom: 6 }}>
            {method === 'Comptant' || method === 'Chèque' || method === 'Dépôt au comptoir' ? 'Prends en photo l’argent, le chèque ou le bordereau de dépôt (preuve pour le comptable).' : 'Photo de preuve (optionnel)'}
          </div>
          <ProofPhoto mediaId={mediaId} link={link} label="Prendre la photo" onChange={setMediaId} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn accent" onClick={() => amount > 0 && onSave({ amount: round2(amount), date, method, mediaId, note: note || undefined })}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function PortalButton({ doc }: { doc: Doc }) {
  const notify = useToast();
  const st = useSyncState();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useLiveQuery(() => db.clients.get(doc.clientId), [doc.clientId]);
  const open = async () => {
    setBusy(true);
    try {
      setLink(await publishPortal(doc.id!));
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };
  const kind = doc.type === 'invoice' ? 'facture' : 'soumission';
  const text = `Bonjour ${client?.contact || client?.name || ''}, voici votre ${kind} ${doc.number}${doc.type === 'quote' ? ' — vous pouvez l’accepter en ligne' : ''}:`;
  return (
    <>
      <button className="btn" onClick={open} disabled={busy || st.status === 'off'} title={st.status === 'off' ? 'Active la synchronisation pour utiliser le lien client' : 'Lien à envoyer au client'}>
        <Link2 size={17} /> {busy ? '…' : 'Lien client'}
      </button>
      {link && (
        <Modal title={`Lien client — ${doc.number}`} onClose={() => setLink(null)}>
          <p className="small muted" style={{ marginTop: 0 }}>
            Le client voit sa {kind}{doc.type === 'quote' ? ', l’accepte et la signe en ligne' : ' et comment payer'}. Aucun compte requis.
          </p>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Lien client" />
            <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(link); notify('Lien copié'); } catch { notify('Sélectionne et copie le lien.', 'err'); } }}><Copy size={16} /></button>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {(isNative() || !!navigator.share) && <button className="btn accent" onClick={() => void shareLink(`${doc.number}`, text, link)}><Share2 size={16} /> Partager</button>}
            {client?.phone && <a className="btn" href={smsLink(client.phone, `${text} ${link}`)}>Texto</a>}
            <a className="btn" href={`mailto:${client?.email ?? ''}?subject=${encodeURIComponent(`${kind[0].toUpperCase()}${kind.slice(1)} ${doc.number}`)}&body=${encodeURIComponent(`${text}\n${link}`)}`}>Courriel</a>
          </div>
          {doc.viewedAt && <div className="notice info" style={{ marginTop: 12 }}>Vu par le client le {new Date(doc.viewedAt).toLocaleString('fr-CA')}</div>}
          {doc.signature && <div className="notice ok">Acceptée et signée par {doc.signature.name} le {new Date(doc.signature.at).toLocaleString('fr-CA')}</div>}
        </Modal>
      )}
    </>
  );
}

function ProfitCard({ doc, onChange }: { doc: Doc; onChange: (p: Partial<Doc>) => void }) {
  const nav = useNavigate();
  const p = useLiveQuery(() => profitOfDoc(doc.id!), [doc.id, doc._u]);
  const receipts = useLiveQuery(() => db.expenses.where('docId').equals(doc.id!).toArray(), [doc.id]) ?? [];
  return (
    <div className="card">
      <div className="card-head">
        <TrendingUp size={18} /><h2>Rentabilité de la job</h2><span className="spacer" />
        {p && <span className={`badge ${p.margin >= 50 ? 'green' : p.margin >= 25 ? 'amber' : 'red'}`}>marge {p.margin} %</span>}
      </div>
      <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="form-grid">
          <label className="field">Heures travaillées<input type="number" inputMode="decimal" step="0.25" value={doc.hoursWorked || ''} placeholder="0" onChange={(e) => onChange({ hoursWorked: Number(e.target.value) || undefined })} /></label>
          <label className="field">Autres coûts ($)<input type="number" inputMode="decimal" step="0.01" value={doc.otherCost || ''} placeholder="sous-traitant…" onChange={(e) => onChange({ otherCost: Number(e.target.value) || undefined })} /></label>
          <div className="full">
            <div className="small muted" style={{ marginBottom: 6 }}>Reçus liés à cette job ({receipts.length})</div>
            {receipts.map((r) => <div key={r.id} className="small"><Link to={`/depenses/${r.id}`}>{r.date} — {r.vendor || r.category}</Link> · {money(r.subtotal)}</div>)}
            <button className="btn small" style={{ marginTop: 6 }} onClick={() => nav(`/depenses/new?doc=${doc.id}`)}><Plus size={14} /> Ajouter un reçu de matériaux</button>
          </div>
        </div>
        {p && (
          <div className="totals">
            <div><span>Revenu (avant taxes)</span><span>{money(p.revenue)}</span></div>
            <div><span>Matériaux</span><span>−{money(p.materials)}</span></div>
            <div><span>Km ({p.km} km)</span><span>−{money(p.kmCost)}</span></div>
            {p.labor > 0 && <div><span>Main-d’œuvre</span><span>−{money(p.labor)}</span></div>}
            {p.other > 0 && <div><span>Autres coûts</span><span>−{money(p.other)}</span></div>}
            <div className="grand"><span>Profit</span><span>{money(p.profit)}</span></div>
            {p.perHour !== undefined && <div className="small muted"><span>Ton taux horaire réel</span><span>{money(p.perHour)}/h</span></div>}
          </div>
        )}
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>Enregistre la facture pour mettre le calcul à jour.</div>
    </div>
  );
}
