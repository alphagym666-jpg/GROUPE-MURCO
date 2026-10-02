import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SendEmailModal } from '../components/SendEmailModal';
import { errMsg, useToast } from '../components/Toast';
import { db } from '../lib/db';
import { buildAccountantZip } from '../lib/exportZip';
import type { Attachment } from '../lib/gmail';
import { useSettings } from '../lib/hooks';
import { docTotals, downloadBlob, formatDate, km, money, toISODate } from '../lib/utils';

function periods() {
  const now = new Date();
  const y = now.getFullYear();
  const mth = now.getMonth();
  const q = Math.floor(mth / 3);
  const d = (yy: number, mm: number, dd: number) => toISODate(new Date(yy, mm, dd));
  return [
    { key: 'month', label: 'Ce mois', from: d(y, mth, 1), to: d(y, mth + 1, 0) },
    { key: 'lastmonth', label: 'Mois dernier', from: d(y, mth - 1, 1), to: d(y, mth, 0) },
    { key: 'quarter', label: 'Ce trimestre', from: d(y, q * 3, 1), to: d(y, q * 3 + 3, 0) },
    { key: 'lastquarter', label: 'Trimestre dernier', from: d(y, q * 3 - 3, 1), to: d(y, q * 3, 0) },
    { key: 'year', label: `Année ${y}`, from: d(y, 0, 1), to: d(y, 11, 31) },
    { key: 'lastyear', label: `Année ${y - 1}`, from: d(y - 1, 0, 1), to: d(y - 1, 11, 31) },
  ];
}

export default function Accountant() {
  const s = useSettings();
  const notify = useToast();
  const P = periods();
  const [from, setFrom] = useState(P[3].from);
  const [to, setTo] = useState(P[3].to);
  const [includeQuotes, setIncludeQuotes] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState<Attachment | null>(null);

  const stats = useLiveQuery(async () => {
    const inR = (x: string) => x >= from && x <= to;
    const [docs, exps, trips] = await Promise.all([db.docs.toArray(), db.expenses.toArray(), db.trips.toArray()]);
    const inv = docs.filter((x) => x.type === 'invoice' && inR(x.date) && x.status !== 'draft' && x.status !== 'cancelled');
    const ex = exps.filter((x) => inR(x.date));
    const tr = trips.filter((x) => inR(x.date));
    const t = inv.reduce((a, x) => { const tt = docTotals(x, s); return { sub: a.sub + tt.subtotal, tps: a.tps + tt.tps, tvq: a.tvq + tt.tvq }; }, { sub: 0, tps: 0, tvq: 0 });
    return {
      inv: inv.length, sales: t.sub, tpsIn: t.tps, tvqIn: t.tvq,
      exp: ex.length, expSub: ex.reduce((a, x) => a + x.subtotal, 0), tpsOut: ex.reduce((a, x) => a + x.tps, 0), tvqOut: ex.reduce((a, x) => a + x.tvq, 0),
      photos: ex.filter((x) => x.photo).length, km: tr.reduce((a, x) => a + x.totalKm, 0), trips: tr.length,
      drafts: docs.filter((x) => x.type === 'invoice' && inR(x.date) && x.status === 'draft').length,
    };
  }, [from, to, s.tpsRate, s.tvqRate]);

  const build = async () => {
    setBusy(true);
    try {
      return await buildAccountantZip({ from, to, includeQuotes, includePhotos });
    } catch (e) {
      notify(errMsg(e), 'err');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const r = await build();
    if (r) downloadBlob(r.blob, r.filename);
  };
  const send = async () => {
    const r = await build();
    if (r) setMail({ filename: r.filename, mimeType: 'application/zip', blob: r.blob });
  };

  return (
    <>
      <div className="page-head"><h1>Dossier pour le comptable</h1></div>
      <div className="card">
        <h2>1. Période</h2>
        <div className="tabs">
          {P.map((p) => (
            <button key={p.key} className={from === p.from && to === p.to ? 'on' : ''} onClick={() => { setFrom(p.from); setTo(p.to); }}>{p.label}</button>
          ))}
        </div>
        <div className="form-grid">
          <label className="field">Du<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field">Au<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check"><input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} /> Inclure les photos des reçus</label>
          <label className="check"><input type="checkbox" checked={includeQuotes} onChange={(e) => setIncludeQuotes(e.target.checked)} /> Inclure les soumissions</label>
        </div>
      </div>

      {stats && (
        <div className="card">
          <h2>2. Aperçu — {formatDate(from)} au {formatDate(to)}</h2>
          {stats.drafts > 0 && <div className="notice">⚠️ {stats.drafts} facture(s) en brouillon dans cette période (non incluses dans les totaux).</div>}
          <div className="grid kpi">
            <div className="card"><div className="label">Ventes av. taxes</div><div className="value">{money(stats.sales)}</div><div className="sub">{stats.inv} facture(s)</div></div>
            <div className="card"><div className="label">Dépenses av. taxes</div><div className="value">{money(stats.expSub)}</div><div className="sub">{stats.exp} reçu(s), {stats.photos} photo(s)</div></div>
            <div className="card"><div className="label">TPS nette</div><div className="value">{money(stats.tpsIn - stats.tpsOut)}</div><div className="sub">perçue {money(stats.tpsIn)} − CTI {money(stats.tpsOut)}</div></div>
            <div className="card"><div className="label">TVQ nette</div><div className="value">{money(stats.tvqIn - stats.tvqOut)}</div><div className="sub">perçue {money(stats.tvqIn)} − RTI {money(stats.tvqOut)}</div></div>
            <div className="card"><div className="label">Km d’affaires</div><div className="value">{km(stats.km)}</div><div className="sub">{stats.trips} déplacement(s)</div></div>
          </div>
          <p className="small muted">
            Le dossier ZIP contient: <strong>Sommaire comptable (PDF)</strong>, toutes les <strong>factures en PDF</strong>, les <strong>reçus classés par catégorie</strong>,
            le <strong>journal de bord</strong> (PDF + Excel) et les fichiers <strong>Factures.csv / Depenses.csv</strong> qui s’ouvrent dans Excel ou s’importent dans le logiciel du comptable.
          </p>
        </div>
      )}

      <div className="card">
        <h2>3. Sortir le dossier</h2>
        <div className="row">
          <button className="btn accent" onClick={download} disabled={busy}>{busy ? 'Préparation…' : '⬇ Télécharger le dossier (ZIP)'}</button>
          <button className="btn primary" onClick={send} disabled={busy}>✉️ Envoyer au comptable</button>
        </div>
        {!s.accountantEmail && <div className="small muted" style={{ marginTop: 8 }}>Astuce: ajoute le courriel de ton comptable dans <Link to="/parametres">Paramètres</Link>.</div>}
      </div>

      {mail && (
        <SendEmailModal
          title="Envoyer au comptable"
          to={s.accountantEmail}
          subject={`${s.companyName} — Documents comptables du ${from} au ${to}`}
          body={`Bonjour${s.accountantName ? ' ' + s.accountantName : ''},\n\nVoici les documents comptables de ${s.companyName} pour la période du ${formatDate(from)} au ${formatDate(to)}: sommaire, factures, reçus de dépenses et journal de bord.\n\nMerci!\n\n${s.emailSignature || s.companyName}\n${s.phone}`}
          attachments={[mail]}
          onClose={() => setMail(null)}
          onSent={async ({ gmailId, to: dest, subject }) => { await db.emails.add({ date: new Date().toISOString(), to: dest, subject, gmailId, kind: 'comptable' }); }}
        />
      )}
    </>
  );
}
