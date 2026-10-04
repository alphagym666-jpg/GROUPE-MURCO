import { CircleCheck, Copy, CreditCard, Download, PenLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SignaturePad } from '../components/SignaturePad';
import { errMsg, useToast } from '../components/Toast';
import { DEFAULT_SETTINGS, type Doc, type Settings } from '../lib/db';
import { buildDocPdf } from '../lib/pdf';
import { loadPortal, signPortal, startCardPayment, type PortalData } from '../lib/portal';
import { downloadBlob, formatDate, lineAmount, money } from '../lib/utils';

/** Page publique envoyée au client: voir, accepter (signer) et payer. */
export default function Portal() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const cfg = params.get('c');
  const notify = useToast();
  const [p, setP] = useState<PortalData | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [sig, setSig] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPortal(token, cfg).then(setP).catch((e) => setErr(errMsg(e)));
  }, [token, cfg]);

  if (err) return <div className="portal"><div className="notice err">{err}</div></div>;
  if (p === undefined) return <div className="portal"><div className="empty">Chargement…</div></div>;
  if (p === null) return <div className="portal"><div className="notice err">Ce lien n’est plus valide. Communique avec l’entreprise pour en recevoir un nouveau.</div></div>;

  const d = p.doc;
  const t = d.totals;
  const isQuote = d.kind === 'quote';
  const signed = !!p.signature;

  const pdf = () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      companyName: p.company.name,
      legalName: p.company.legalName,
      ownerName: p.company.owner,
      address: p.company.lines[0] ?? '',
      city: p.company.lines[1] ?? '',
      province: '',
      postalCode: '',
      phone: p.company.phone,
      email: p.company.email,
      logo: p.company.logo,
      paymentInstructions: p.company.paymentInstructions,
      invoiceConditions: p.company.conditions,
      tpsRate: p.company.tpsRate,
      tvqRate: p.company.tvqRate,
      tpsNumber: p.company.tpsNumber,
      tvqNumber: p.company.tvqNumber,
      chargeTaxes: p.company.chargeTaxes,
    };
    const docObj: Doc = {
      type: d.kind, number: d.number, clientId: 0, date: d.date, dueDate: d.dueDate, jobDate: d.jobDate, jobAddress: d.jobAddress, title: d.title,
      items: d.items, applyTps: d.applyTps, applyTvq: d.applyTvq, discount: d.discount, deposit: d.deposit, notes: d.notes, status: d.status, payments: [],
      signature: p.signature ?? undefined, createdAt: '', updatedAt: '',
    };
    const blob = buildDocPdf(docObj, { name: p.client.name, address: p.client.address, contact: '', email: '', phone: '', notes: '', createdAt: '' }, settings).output('blob');
    downloadBlob(blob, `${isQuote ? 'Soumission' : 'Facture'}_${d.number}.pdf`);
  };

  const accept = async () => {
    if (name.trim().length < 2) return notify('Écris ton nom complet.', 'err');
    if (!sig) return notify('Signe dans le cadre.', 'err');
    if (!agree) return notify('Coche la case pour confirmer.', 'err');
    setBusy(true);
    try {
      const signature = { name: name.trim(), at: new Date().toISOString(), image: sig };
      await signPortal(token, cfg, signature);
      setP({ ...p, signature });
      notify('Merci! Ta soumission est acceptée.');
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const interac = p.company.paymentInstructions.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  const paidOnline = (p.cardPayments ?? []).reduce((a, x) => a + x.amount, 0);
  const due = Math.max(0, Math.round(((t.balance || t.total) - paidOnline) * 100) / 100);
  const justPaid = params.get('paid') === '1';
  const payCard = async () => {
    setBusy(true);
    try {
      location.href = await startCardPayment(p);
    } catch (e) {
      notify(errMsg(e), 'err');
      setBusy(false);
    }
  };

  return (
    <div className="portal">
      <div className="portal-head">
        <div>
          {p.company.logo && <img src={p.company.logo} alt="" style={{ maxHeight: 54, maxWidth: 200, display: 'block', marginBottom: 8 }} />}
          <div className="co">{p.company.name}</div>
          <div className="small muted">{[...p.company.lines, p.company.phone, p.company.email].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="doc">
          <div className="k">{isQuote ? 'SOUMISSION' : 'FACTURE'}</div>
          <div className="small">No {d.number} · {formatDate(d.date)}</div>
          <div className="small muted">{isQuote ? `Valide jusqu’au ${formatDate(d.dueDate)}` : d.dueDate <= d.date ? 'Payable sur réception' : `Échéance ${formatDate(d.dueDate)}`}</div>
        </div>
      </div>

      <div className="card">
        <div className="small muted">{isQuote ? 'Préparée pour' : 'Facturée à'}</div>
        <div style={{ fontWeight: 700 }}>{p.client.name}</div>
        {d.jobAddress && <div className="small muted">Lieu des travaux: {d.jobAddress}</div>}
        {d.title && <h2 style={{ marginTop: 12 }}>{d.title}</h2>}
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Service</th><th className="num">Qté</th><th className="num hide-mobile">Prix</th><th className="num">Montant</th></tr></thead>
            <tbody>
              {d.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.code && <b style={{ color: 'var(--amber-ink)', marginRight: 6 }}>{it.code}</b>}{it.description}</td>
                  <td className="num">{it.quantity} {it.unit}</td>
                  <td className="num hide-mobile">{money(it.unitPrice)}</td>
                  <td className="num">{money(lineAmount(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="totals" style={{ marginTop: 12 }}>
          {t.discount > 0 && <div><span>Rabais</span><span>−{money(t.discount)}</span></div>}
          {d.applyTps && <div><span>TPS</span><span>{money(t.tps)}</span></div>}
          {d.applyTvq && <div><span>TVQ</span><span>{money(t.tvq)}</span></div>}
          <div className="grand"><span>Total</span><span>{money(t.total)}</span></div>
          {t.deposit > 0 && <div><span>Dépôt reçu</span><span>−{money(t.deposit)}</span></div>}
          {!isQuote && t.paid > 0 && <div className="grand"><span>Solde</span><span>{money(t.balance)}</span></div>}
        </div>
        {d.notes && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{d.notes}</p>}
        <button className="btn" onClick={pdf}><Download size={16} /> Télécharger le PDF</button>
      </div>

      {isQuote && (
        <div className="card">
          {signed ? (
            <div className="row" style={{ gap: 12 }}>
              <CircleCheck size={36} color="var(--green)" />
              <div>
                <div style={{ fontWeight: 700 }}>Soumission acceptée</div>
                <div className="small muted">par {p.signature!.name} le {new Date(p.signature!.at).toLocaleString('fr-CA')}</div>
              </div>
            </div>
          ) : (
            <>
              <h2><PenLine size={18} style={{ verticalAlign: '-3px' }} /> Accepter la soumission</h2>
              <div className="grid" style={{ gap: 12 }}>
                <label className="field">Ton nom complet<input value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} /></label>
                <SignaturePad onChange={setSig} />
                <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> J’accepte les travaux et le prix de {money(t.total)}.</label>
                <button className="btn accent big" disabled={busy} onClick={accept}>{busy ? 'Envoi…' : 'Accepter et signer'}</button>
              </div>
            </>
          )}
        </div>
      )}

      {!isQuote && (
        <div className="card">
          <h2>Comment payer</h2>
          {(justPaid || (paidOnline > 0 && due <= 0)) && (
            <div className="notice ok row"><CircleCheck size={18} /> Merci! Votre paiement par carte {justPaid && !paidOnline ? 'est en cours de confirmation' : `de ${money(paidOnline)} est reçu`}.</div>
          )}
          {p.company.cardPayments && due > 0 && !justPaid && (
            <div style={{ marginBottom: 14 }}>
              <button className="btn accent big block" disabled={busy} onClick={payCard}><CreditCard size={20} /> {busy ? 'Ouverture…' : `Payer ${money(due)} par carte`}</button>
              <div className="small muted" style={{ marginTop: 6, textAlign: 'center' }}>Visa, Mastercard, Amex, Apple Pay, Google Pay — paiement sécurisé par Stripe</div>
            </div>
          )}
          <p style={{ marginTop: 0 }}>{p.company.cardPayments && due > 0 ? 'Ou par: ' : ''}{p.company.paymentInstructions}</p>
          {interac && (
            <div className="row">
              <span>Courriel Interac: <strong>{interac}</strong></span>
              <button className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(interac); notify('Courriel copié'); } catch { notify(interac); } }}><Copy size={15} /> Copier</button>
            </div>
          )}
          <p className="small muted">Montant: <strong>{money(t.balance || t.total)}</strong> · Référence: {d.number}</p>
          {p.company.conditions && <p className="small muted">{p.company.conditions}</p>}
        </div>
      )}
      <p className="small muted" style={{ textAlign: 'center' }}>{p.company.legalName}</p>
    </div>
  );
}
