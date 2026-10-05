import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { errMsg, useConfirm, useToast } from '../components/Toast';
import { db, type Trip } from '../lib/db';
import { AddressInput } from '../components/AddressInput';
import { currentPosition, directionsLink, drivingDistance, embedDirectionsUrl, geocode, reverseGeocode } from '../lib/geo';
import { useSettings } from '../lib/hooks';
import { buildLogbookPdf } from '../lib/pdf';
import { ensureHomeGeo } from '../lib/trips';
import { downloadBlob, METHOD_LABEL, formatDate, km, kmAllowance, money, toCSV, todayISO } from '../lib/utils';
import { NumInput } from '../components/NumInput';

const SOURCE_LABEL: Record<Trip['source'], string> = { 'auto-facture': 'auto', 'auto-recu': 'auto', 'auto-agenda': 'route', manuel: '' };

export default function Logbook() {
  const s = useSettings();
  const notify = useToast();
  const [params, setParams] = useSearchParams();
  const [year, setYear] = useState(todayISO().slice(0, 4));
  const [edit, setEdit] = useState<Trip | null>(null);

  const all = useLiveQuery(() => db.trips.orderBy('date').reverse().toArray(), []) ?? [];
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? [];
  const years = [...new Set([todayISO().slice(0, 4), ...all.map((t) => t.date.slice(0, 4))])].sort().reverse();
  const trips = all.filter((t) => year === 'tout' || t.date.startsWith(year));
  const total = trips.reduce((a, t) => a + t.totalKm, 0);

  const blank = (): Trip => ({
    date: todayISO(), fromLabel: s.homeAddress, fromGeo: s.homeGeo, toLabel: '', oneWayKm: 0, roundTrip: true, totalKm: 0, reason: '',
    source: 'manuel', distanceMethod: 'manuel', createdAt: new Date().toISOString(),
  });

  useEffect(() => {
    if (params.get('add')) {
      setEdit(blank());
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const byMonth = new Map<string, number>();
  trips.forEach((t) => byMonth.set(t.date.slice(0, 7), (byMonth.get(t.date.slice(0, 7)) ?? 0) + t.totalKm));

  const exportPdf = () => {
    const sorted = [...trips].sort((a, b) => a.date.localeCompare(b.date));
    downloadBlob(buildLogbookPdf(sorted, s, year === 'tout' ? 'Toutes les dates' : `Année ${year}`), `Journal_de_bord_${year}.pdf`);
  };
  const exportCsv = () => {
    const rows: unknown[][] = [['Date', 'Départ', 'Destination', 'Raison', 'Aller-retour', 'Km aller', 'Km total']];
    [...trips].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => rows.push([t.date, t.fromLabel, t.toLabel, t.reason, t.roundTrip ? 'Oui' : 'Non', t.oneWayKm, t.totalKm]));
    downloadBlob(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }), `Journal_de_bord_${year}.csv`);
  };

  return (
    <>
      <div className="page-head">
        <h1>Journal de bord</h1>
        <div className="actions">
          <select value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 'auto' }}>
            {years.map((y) => <option key={y}>{y}</option>)}
            <option value="tout">Tout</option>
          </select>
          <button className="btn accent" onClick={() => setEdit(blank())}>+ Déplacement</button>
          <button className="btn" onClick={exportPdf}>⬇ PDF</button>
          <button className="btn" onClick={exportCsv}>⬇ Excel/CSV</button>
        </div>
      </div>

      {!s.homeAddress && <div className="notice">Ajoute ton adresse de domicile dans <Link to="/parametres">Paramètres</Link> pour que les km se calculent automatiquement.</div>}

      <div className="grid kpi">
        <div className="card"><div className="label">Km d’affaires</div><div className="value">{km(total)}</div><div className="sub">{trips.length} déplacement(s)</div></div>
        <div className="card"><div className="label">Allocation estimée</div><div className="value">{money(kmAllowance(total, s))}</div><div className="sub">{s.kmRateFirst5000} $ / {s.kmRateAfter5000} $ par km</div></div>
        <div className="card"><div className="label">Moyenne par déplacement</div><div className="value">{km(trips.length ? total / trips.length : 0)}</div></div>
      </div>

      {byMonth.size > 1 && (
        <div className="card">
          <h2>Par mois</h2>
          <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 120 }}>
            {[...byMonth.entries()].sort().map(([m, v]) => {
              const max = Math.max(...byMonth.values());
              return (
                <div key={m} style={{ flex: 1, textAlign: 'center', minWidth: 24 }} title={`${m}: ${km(v)}`}>
                  <div style={{ height: Math.max(4, (v / max) * 90), background: 'var(--orange)', borderRadius: '4px 4px 0 0' }} />
                  <div className="small muted">{m.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        {trips.length === 0 ? (
          <div className="empty">Aucun déplacement. Ils s’ajoutent automatiquement quand tu crées une facture avec un lieu de travaux, ou quand tu ajoutes un reçu avec photo.</div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Date</th><th>Destination / Raison</th><th className="hide-mobile">Source</th><th className="num">Km</th></tr></thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id} className="click" onClick={() => setEdit(t)}>
                    <td>{t.date}</td>
                    <td>{t.toLabel}<div className="small muted">{t.reason}</div></td>
                    <td className="hide-mobile small">{SOURCE_LABEL[t.source]}{t.distanceMethod === 'google' ? ' · Google' : t.distanceMethod === 'estimation' ? ' ≈' : ''}</td>
                    <td className="num"><strong>{t.totalKm.toFixed(1)}</strong><div className="small muted">{t.roundTrip ? 'A/R' : 'aller'}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <TripModal trip={edit} clients={clients} onClose={() => setEdit(null)} notify={notify} mapsKey={s.googleMapsKey} />}
    </>
  );
}

function TripModal({ trip, clients, onClose, notify, mapsKey }: { trip: Trip; clients: { id?: number; name: string; address: string }[]; onClose: () => void; notify: ReturnType<typeof useToast>; mapsKey: string }) {
  const [t, setT] = useState<Trip>(trip);
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<Trip>) => setT((x) => {
    const n = { ...x, ...p };
    n.totalKm = Math.round(n.oneWayKm * (n.roundTrip ? 2 : 1) * 10) / 10;
    return n;
  });

  const calc = async () => {
    setBusy(true);
    try {
      const home = await ensureHomeGeo();
      const fromGeo = t.fromLabel.trim() && t.fromLabel !== home.label ? (await geocode(t.fromLabel))?.geo : home.geo;
      if (!fromGeo) throw new Error('Adresse de départ introuvable.');
      const toGeo = t.toGeo ?? (await geocode(t.toLabel))?.geo;
      if (!toGeo) throw new Error('Destination introuvable. Ajoute la ville.');
      const r = await drivingDistance(fromGeo, toGeo);
      up({ fromGeo, toGeo, oneWayKm: r.km, distanceMethod: r.method, durationMin: r.durationMin, fromLabel: t.fromLabel || home.label });
      notify(`${km(r.km)} aller${r.method === 'google' ? ' (Google Maps)' : r.method === 'estimation' ? ' (estimation)' : ''}`);
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const here = async () => {
    setBusy(true);
    try {
      const g = await currentPosition();
      const label = await reverseGeocode(g);
      const home = await ensureHomeGeo();
      const r = await drivingDistance(home.geo, g);
      up({ toLabel: label, toGeo: g, oneWayKm: r.km, distanceMethod: r.method, durationMin: r.durationMin, fromLabel: home.label, fromGeo: home.geo });
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!t.reason.trim()) return notify('La raison du déplacement est requise (exigence fiscale).', 'err');
    await db.trips.put(t);
    notify('Déplacement enregistré');
    onClose();
  };

  const remove = async () => {
    if (!t.id || !(await ask({ title: 'Supprimer ce déplacement?', confirm: 'Supprimer', danger: true }))) return;
    await db.trips.delete(t.id);
    if (t.docId) await db.docs.update(t.docId, { tripId: undefined });
    if (t.expenseId) await db.expenses.update(t.expenseId, { tripId: undefined });
    onClose();
  };

  return (
    <Modal title={t.id ? 'Déplacement' : 'Nouveau déplacement'} onClose={onClose}>
      {t.docId && <div className="notice info small">Créé automatiquement depuis une <Link to={`/doc/${t.docId}`} onClick={onClose}>facture</Link>.</div>}
      <div className="form-grid">
        <label className="field">Date<input type="date" value={t.date} onChange={(e) => up({ date: e.target.value })} /></label>
        <label className="field">Client (optionnel)
          <select value={t.clientId ?? ''} onChange={(e) => {
            const c = clients.find((x) => x.id === Number(e.target.value));
            up({ clientId: c?.id, ...(c && !t.toLabel ? { toLabel: c.address, toGeo: undefined } : {}) });
          }}>
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field full">Départ<input value={t.fromLabel} onChange={(e) => up({ fromLabel: e.target.value, fromGeo: undefined })} /></label>
        <label className="field full">Destination
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <AddressInput value={t.toLabel} onChange={(v) => up({ toLabel: v, toGeo: undefined })} onPick={(label, geo) => up({ toLabel: label, toGeo: geo })} placeholder="adresse, ville" />
            <button className="btn" onClick={here} disabled={busy} title="Ma position actuelle">Ici</button>
          </div>
        </label>
        <label className="field full">Raison (affaires) *<input value={t.reason} onChange={(e) => up({ reason: e.target.value })} placeholder="ex.: Achat matériaux chez Rona pour job Tremblay" /></label>
        <label className="field">Km (aller)
          <NumInput value={t.oneWayKm} onChange={(n) => up({ oneWayKm: n, distanceMethod: 'manuel' })} />
        </label>
        <label className="field">&nbsp;<button className="btn" onClick={calc} disabled={busy || !t.toLabel}>{busy ? 'Calcul…' : 'Calculer les km'}</button></label>
        <label className="check full"><input type="checkbox" checked={t.roundTrip} onChange={(e) => up({ roundTrip: e.target.checked })} /> Aller-retour</label>
      </div>
      <div className="notice ok" style={{ marginTop: 12 }}>
        Total: <strong>{km(t.totalKm)}</strong>
        {t.durationMin ? <> · ≈ {t.durationMin} min</> : null}
        {t.toLabel && <> · <a href={directionsLink(t.fromGeo ?? t.fromLabel, t.toGeo ?? t.toLabel)} target="_blank" rel="noreferrer">ouvrir dans Google Maps</a></>}
        <div className="small muted">{METHOD_LABEL[t.distanceMethod]}</div>
        {mapsKey && t.toLabel && <iframe className="map-embed" title="Trajet" loading="lazy" src={embedDirectionsUrl(mapsKey, t.fromGeo ?? t.fromLabel, t.toGeo ?? t.toLabel)} />}
        <div className="small muted">{formatDate(t.date)}</div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {t.id && <button className="btn danger" onClick={remove}>Supprimer</button>}
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn accent" onClick={save}>Enregistrer</button>
      </div>
    </Modal>
  );
}
