import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Download, Receipt, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { saveSettings } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { buildTaxReportPdf } from '../lib/pdf';
import { profitByInvoice } from '../lib/profit';
import { periodsOfYear, smallSupplierStatus, taxReport } from '../lib/taxes';
import { downloadBlob, km, lineAmount, money, toISODate, todayISO } from '../lib/utils';

function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);
  const d = (yy: number, mm: number, dd: number) => toISODate(new Date(yy, mm, dd));
  return [
    { label: 'Ce mois', from: d(y, m, 1), to: d(y, m + 1, 0) },
    { label: 'Ce trimestre', from: d(y, q * 3, 1), to: d(y, q * 3 + 3, 0) },
    { label: `Année ${y}`, from: d(y, 0, 1), to: d(y, 11, 31) },
    { label: `Année ${y - 1}`, from: d(y - 1, 0, 1), to: d(y - 1, 11, 31) },
  ];
}

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('t') === 'taxes' ? 'taxes' : 'profit';
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><TrendingUp size={14} /> Rapports</div>
          <h1>{tab === 'profit' ? 'Rentabilité' : 'TPS / TVQ'}</h1>
        </div>
        <div className="seg">
          <button className={tab === 'profit' ? 'on' : ''} onClick={() => setParams({}, { replace: true })}>Rentabilité</button>
          <button className={tab === 'taxes' ? 'on' : ''} onClick={() => setParams({ t: 'taxes' }, { replace: true })}>TPS / TVQ</button>
        </div>
      </div>
      {tab === 'profit' ? <Profit /> : <Taxes />}
    </>
  );
}

function Profit() {
  const nav = useNavigate();
  const s = useSettings();
  const P = presets();
  const [from, setFrom] = useState(P[2].from);
  const [to, setTo] = useState(P[2].to);
  const data = useLiveQuery(() => profitByInvoice(from, to), [from, to, s.kmCost, s.laborCostPerHour]);
  if (!data) return null;
  const r = data.rows;
  const sum = (k: 'revenue' | 'materials' | 'kmCost' | 'labor' | 'other' | 'cost' | 'profit' | 'hours' | 'km') => r.reduce((a, x) => a + x[k], 0);
  const revenue = sum('revenue');
  const profit = sum('profit');
  const hours = sum('hours');
  const net = profit - data.overhead;

  // Par code et par client
  const byCode = new Map<string, number>();
  r.forEach((x) => x.doc.items.forEach((it) => byCode.set(it.code || 'Autre', (byCode.get(it.code || 'Autre') ?? 0) + lineAmount(it))));
  const byClient = new Map<string, { revenue: number; profit: number; n: number }>();
  r.forEach((x) => {
    const k = x.client?.name ?? '—';
    const c = byClient.get(k) ?? { revenue: 0, profit: 0, n: 0 };
    byClient.set(k, { revenue: c.revenue + x.revenue, profit: c.profit + x.profit, n: c.n + 1 });
  });
  const marginClass = (m: number) => (m >= 50 ? 'green' : m >= 25 ? 'amber' : 'red');

  return (
    <>
      <div className="tabs">
        {P.map((p) => <button key={p.label} className={from === p.from && to === p.to ? 'on' : ''} onClick={() => { setFrom(p.from); setTo(p.to); }}>{p.label}</button>)}
      </div>
      <div className="grid kpi">
        <div className="card"><div className="label">Revenus (av. taxes)</div><div className="value">{money(revenue)}</div><div className="sub">{r.length} facture(s)</div></div>
        <div className="card"><div className="label">Coûts directs</div><div className="value">{money(sum('cost'))}</div><div className="sub">matériaux {money(sum('materials'))} · km {money(sum('kmCost'))}</div></div>
        <div className="card hot"><div className="label">Profit des jobs</div><div className="value">{money(profit)}</div><div className="sub">marge {revenue ? Math.round((profit / revenue) * 100) : 0} %</div></div>
        <div className="card"><div className="label">Après frais généraux</div><div className="value">{money(net)}</div><div className="sub">frais généraux {money(data.overhead)}</div></div>
        {hours > 0 && <div className="card"><div className="label">Ton taux horaire réel</div><div className="value">{money((profit + sum('labor')) / hours)}/h</div><div className="sub">{hours} h travaillées</div></div>}
      </div>

      <div className="card">
        <div className="card-head"><h2>Par job</h2><span className="spacer" /><span className="small muted">Coût du km: {money(s.kmCost)} · main-d’œuvre: {money(s.laborCostPerHour)}/h (<Link to="/parametres">modifier</Link>)</span></div>
        {r.length === 0 ? <div className="empty">Aucune facture pour cette période.</div> : (
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Facture</th><th className="num">Revenu</th><th className="num hide-mobile">Matériaux</th><th className="num hide-mobile">Km</th><th className="num hide-mobile">Heures</th><th className="num">Profit</th><th className="num">Marge</th></tr></thead>
              <tbody>
                {r.map((x) => (
                  <tr key={x.doc.id} className="click" onClick={() => nav(`/doc/${x.doc.id}`)}>
                    <td><strong>{x.doc.number}</strong> {x.client?.name}<div className="small muted">{x.doc.title}</div></td>
                    <td className="num">{money(x.revenue)}</td>
                    <td className="num hide-mobile">{x.materials ? money(x.materials) : '—'}</td>
                    <td className="num hide-mobile">{x.km ? `${km(x.km)} · ${money(x.kmCost)}` : '—'}</td>
                    <td className="num hide-mobile">{x.hours || '—'}</td>
                    <td className="num"><strong>{money(x.profit)}</strong>{x.perHour !== undefined && <div className="small muted">{money(x.perHour)}/h</div>}</td>
                    <td className="num"><span className={`badge ${marginClass(x.margin)}`}>{x.margin} %</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">Les matériaux viennent des reçus liés à la facture (champ « Pour la facture » du reçu). Les heures se notent sur la facture, section Rentabilité.</p>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Ventes par code</h2>
          {[...byCode.entries()].sort((a, b) => b[1] - a[1]).map(([code, v]) => (
            <div key={code} className="hbar"><b>{code}</b><div className="track"><div className="fill" style={{ width: `${(v / Math.max(1, ...byCode.values())) * 100}%` }} /></div><span className="num small">{money(v)}</span></div>
          ))}
          {byCode.size === 0 && <div className="small muted">—</div>}
        </div>
        <div className="card">
          <h2>Meilleurs clients</h2>
          <table className="list"><tbody>
            {[...byClient.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8).map(([name, c]) => (
              <tr key={name}><td>{name}<div className="small muted">{c.n} facture(s)</div></td><td className="num">{money(c.revenue)}<div className="small muted">profit {money(c.profit)}</div></td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </>
  );
}

function Taxes() {
  const s = useSettings();
  const [year, setYear] = useState(new Date().getFullYear());
  const periods = periodsOfYear(year, s.taxFiling);
  const rows = useLiveQuery(() => taxReport(periods), [year, s.taxFiling, s.chargeTaxes]);
  const small = useLiveQuery(() => smallSupplierStatus(), []);
  const today = todayISO();

  return (
    <>
      {!s.chargeTaxes && small && (
        <div className="card">
          <div className="card-head">
            {small.rolling >= small.limit * 0.8 || small.current >= small.limit ? <AlertTriangle size={20} color="var(--red)" /> : <Receipt size={20} />}
            <h2>Seuil de petit fournisseur (30 000 $)</h2>
          </div>
          <p className="small" style={{ marginTop: 0 }}>Tu ne charges pas encore la TPS/TVQ. Tu dois t’inscrire quand tes ventes taxables dépassent <strong>30 000 $</strong> sur 4 trimestres de suite (ou dans un seul trimestre).</p>
          <div className="hbar" style={{ gridTemplateColumns: '120px 1fr auto' }}>
            <span>4 derniers trimestres</span>
            <div className="track"><div className="fill" style={{ width: `${Math.min(100, (small.rolling / small.limit) * 100)}%`, background: small.rolling >= small.limit * 0.8 ? 'var(--red)' : undefined }} /></div>
            <span className="num small"><strong>{money(small.rolling)}</strong> / 30 000 $</span>
          </div>
          <div className="row small muted" style={{ marginTop: 6 }}>{small.quarters.map((q) => <span key={q.label}>{q.label}: {money(q.sales)}</span>)}</div>
          {small.rolling >= small.limit * 0.8 && <div className="notice err" style={{ marginTop: 10 }}>Tu approches du seuil. Parle à ton comptable pour t’inscrire à la TPS/TVQ, puis active « Je charge la TPS/TVQ » dans Paramètres.</div>}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Déclarations {year}</h2>
          <span className="spacer" />
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Année">
            {[0, 1, 2].map((i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}
          </select>
          <select value={s.taxFiling} onChange={(e) => saveSettings({ taxFiling: e.target.value as typeof s.taxFiling })} style={{ width: 'auto' }} aria-label="Fréquence de déclaration">
            <option value="annuel">Annuelle</option>
            <option value="trimestriel">Trimestrielle</option>
            <option value="mensuel">Mensuelle</option>
          </select>
        </div>
        {!s.chargeTaxes && <div className="notice info">Tu n’es pas inscrit: aucune taxe perçue à remettre. Le rapport sert de référence (et au seuil ci-dessus).</div>}
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Période</th><th className="num">Ventes</th><th className="num">TPS nette</th><th className="num">TVQ nette</th><th className="num">À remettre</th><th></th></tr></thead>
            <tbody>
              {rows?.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}{p.from <= today && today <= p.to && <span className="badge blue" style={{ marginLeft: 6 }}>en cours</span>}<div className="small muted">{p.invoices} facture(s) · {p.receipts} reçu(s)</div></td>
                  <td className="num">{money(p.sales)}</td>
                  <td className="num">{money(p.tpsNet)}<div className="small muted">{money(p.tpsCollected)} − {money(p.tpsPaid)}</div></td>
                  <td className="num">{money(p.tvqNet)}<div className="small muted">{money(p.tvqCollected)} − {money(p.tvqPaid)}</div></td>
                  <td className="num"><strong>{money(p.tpsNet + p.tvqNet)}</strong></td>
                  <td><button className="btn small" onClick={() => downloadBlob(buildTaxReportPdf(p, s), `Rapport_TPS_TVQ_${p.label.replace(/\s+/g, '_')}.pdf`)}><Download size={14} /> PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Taxes perçues selon la date des factures émises; CTI/RTI selon les reçus de dépenses. Méthode régulière. Valide avec ton comptable avant de produire ta déclaration.</p>
      </div>
    </>
  );
}
