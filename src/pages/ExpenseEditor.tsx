import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errMsg, useToast } from '../components/Toast';
import { db, EXPENSE_CATEGORIES, type Expense } from '../lib/db';
import { currentPosition, drivingDistance, geocode, mapsLink, reverseGeocode } from '../lib/geo';
import { useSettings } from '../lib/hooks';
import { compressImage, pendingImport, readPhotoInfo, splitTaxes } from '../lib/receipt';
import { ensureHomeGeo, syncTripForExpense } from '../lib/trips';
import { km, round2, todayISO } from '../lib/utils';

const blank = (): Expense => ({
  date: todayISO(), vendor: '', category: 'Essence', subtotal: 0, tps: 0, tvq: 0, total: 0, paymentMethod: 'Carte de crédit',
  notes: '', locationLabel: '', createdAt: new Date().toISOString(),
});

export default function ExpenseEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = id === 'new';
  const nav = useNavigate();
  const notify = useToast();
  const s = useSettings();
  const [e, setE] = useState<Expense | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [addTrip, setAddTrip] = useState(true);
  const [roundTrip, setRoundTrip] = useState(true);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? [];
  const docs = useLiveQuery(() => db.docs.where('type').equals('invoice').reverse().sortBy('date'), []) ?? [];
  const trip = useLiveQuery(() => (e?.tripId ? db.trips.get(e.tripId) : undefined), [e?.tripId]);

  useEffect(() => {
    (async () => {
      if (isNew) {
        const ex = blank();
        if (params.get('doc')) {
          const d = await db.docs.get(Number(params.get('doc')));
          if (d) Object.assign(ex, { docId: d.id, clientId: d.clientId });
        }
        setE(ex);
        if (pendingImport.file) {
          const f = pendingImport.file;
          const meta = { vendor: pendingImport.vendor, date: pendingImport.date };
          pendingImport.file = null;
          await handleFile(f, ex, meta);
        }
      } else {
        const ex = await db.expenses.get(Number(id));
        if (!ex) return nav('/depenses');
        setE(ex);
        setAddTrip(!!ex.tripId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!e?.photo) return setPhotoUrl(null);
    const u = URL.createObjectURL(e.photo);
    setPhotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [e?.photo]);

  if (!e) return null;
  const up = (p: Partial<Expense>) => setE((x) => ({ ...x!, ...p }));

  async function locate(geo: Expense['geo'], source: Expense['geoSource'], base: Expense) {
    if (!geo) return base;
    const label = await reverseGeocode(geo);
    let kmFromHome: number | undefined;
    try {
      const home = await ensureHomeGeo();
      kmFromHome = (await drivingDistance(home.geo, geo)).km;
    } catch (err) {
      notify(errMsg(err), 'err');
    }
    return { ...base, geo, geoSource: source, locationLabel: label, kmFromHome };
  }

  async function handleFile(file: File, base: Expense, meta: { vendor?: string; date?: string } = {}) {
    setBusy('Lecture de la photo…');
    try {
      const info = await readPhotoInfo(file);
      const c = await compressImage(file);
      let next: Expense = { ...base, photo: c.blob, photoName: c.name, photoType: c.type, date: info.date ?? meta.date ?? base.date, vendor: base.vendor || meta.vendor || '' };
      if (info.geo) {
        setBusy('Position trouvée dans la photo, calcul des km…');
        next = await locate(info.geo, 'photo', next);
        notify(`📍 ${next.locationLabel}${next.kmFromHome !== undefined ? ` — ${km(next.kmFromHome)} de chez toi` : ''}`);
      }
      setE(next);
    } catch (err) {
      notify(errMsg(err), 'err');
    } finally {
      setBusy('');
    }
  }

  const useGps = async () => {
    setBusy('Localisation…');
    try {
      const g = await currentPosition();
      setE(await locate(g, 'gps', e));
    } catch (err) {
      notify(errMsg(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const useAddress = async () => {
    if (!e.locationLabel.trim()) return notify('Écris l’adresse ou le nom du commerce + ville.', 'err');
    setBusy('Recherche de l’adresse…');
    try {
      const g = await geocode(e.locationLabel);
      if (!g) throw new Error('Adresse introuvable. Ajoute la ville.');
      const n = await locate(g.geo, 'adresse', e);
      setE({ ...n, locationLabel: e.locationLabel });
    } catch (err) {
      notify(errMsg(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const setTotal = (total: number) => {
    const t = splitTaxes(total, s.tpsRate, s.tvqRate);
    up({ total, ...t });
  };

  const save = async () => {
    if (!e.total && !e.subtotal) return notify('Entre le montant du reçu.', 'err');
    setBusy('Enregistrement…');
    try {
      const toSave = { ...e, total: round2(e.total || e.subtotal + e.tps + e.tvq) };
      const eid = await db.expenses.put(toSave);
      let msg = 'Reçu enregistré';
      if (addTrip && toSave.geo) {
        try {
          const t = await syncTripForExpense(eid, roundTrip);
          if (t) msg += ` · ${km(t.totalKm)} au journal de bord`;
        } catch (err) {
          notify(errMsg(err), 'err');
        }
      } else if (!addTrip && toSave.tripId) {
        await db.trips.delete(toSave.tripId);
        await db.expenses.update(eid, { tripId: undefined });
      }
      notify(msg);
      nav('/depenses');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!e.id || !confirm('Supprimer ce reçu?')) return;
    if (e.tripId) await db.trips.delete(e.tripId);
    await db.expenses.delete(e.id);
    nav('/depenses');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small muted"><Link to="/depenses">← Reçus et dépenses</Link></div>
          <h1>{isNew ? 'Nouveau reçu' : 'Reçu'}</h1>
        </div>
        <div className="actions">
          <button className="btn accent" onClick={save} disabled={!!busy}>💾 Enregistrer</button>
        </div>
      </div>
      {busy && <div className="notice info">⏳ {busy}</div>}

      <div className="grid two">
        <div className="card">
          <h2>Photo du reçu</h2>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(ev) => ev.target.files?.[0] && handleFile(ev.target.files[0], e)} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(ev) => ev.target.files?.[0] && handleFile(ev.target.files[0], e)} />
          <div className="row">
            <button className="btn accent" onClick={() => camRef.current?.click()}>📷 Prendre une photo</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>🖼 Choisir un fichier</button>
          </div>
          {photoUrl && (e.photoType === 'application/pdf'
            ? <p><a href={photoUrl} target="_blank" rel="noreferrer">📄 Voir le PDF du reçu</a></p>
            : <a href={photoUrl} target="_blank" rel="noreferrer"><img src={photoUrl} className="photo-preview" style={{ marginTop: 12 }} alt="Reçu" /></a>)}

          <h3 style={{ marginTop: 18 }}>📍 Où (pour calculer les km de chez toi)</h3>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input value={e.locationLabel} placeholder="ex.: Petro-Canada, boul. Labelle, Blainville" onChange={(ev) => up({ locationLabel: ev.target.value, geo: undefined, kmFromHome: undefined })} />
            <button className="btn" onClick={useAddress} disabled={!!busy}>🔎</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={useGps} disabled={!!busy}>📍 Je suis sur place (GPS)</button>
            {e.geo && <a className="btn small" href={mapsLink(e.geo)} target="_blank" rel="noreferrer">🗺 Carte</a>}
          </div>
          {e.kmFromHome !== undefined && (
            <div className="notice ok" style={{ marginTop: 10 }}>
              <strong>{km(e.kmFromHome)}</strong> de ton domicile{e.geoSource === 'photo' ? ' (position lue dans la photo)' : e.geoSource === 'gps' ? ' (GPS)' : ''}
              <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={addTrip} onChange={(ev) => setAddTrip(ev.target.checked)} /> Ajouter au journal de bord</label>
              {addTrip && !trip && <label className="check"><input type="checkbox" checked={roundTrip} onChange={(ev) => setRoundTrip(ev.target.checked)} /> Aller-retour ({km(e.kmFromHome * (roundTrip ? 2 : 1))})</label>}
              {trip && <div className="small">Au journal: {km(trip.totalKm)} — {trip.reason}</div>}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Détails</h2>
          <div className="form-grid">
            <label className="field">Date<input type="date" value={e.date} onChange={(ev) => up({ date: ev.target.value })} /></label>
            <label className="field">Catégorie
              <select value={e.category} onChange={(ev) => up({ category: ev.target.value })}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="field full">Fournisseur / commerce<input value={e.vendor} onChange={(ev) => up({ vendor: ev.target.value })} placeholder="ex.: Shell, Rona, Home Depot" /></label>
            <label className="field full">Total payé (taxes incluses)
              <input type="number" step="0.01" inputMode="decimal" value={e.total || ''} onChange={(ev) => setTotal(Number(ev.target.value))} />
            </label>
            <label className="field">Avant taxes<input type="number" step="0.01" inputMode="decimal" value={e.subtotal} onChange={(ev) => up({ subtotal: Number(ev.target.value) })} /></label>
            <label className="field">TPS<input type="number" step="0.01" inputMode="decimal" value={e.tps} onChange={(ev) => up({ tps: Number(ev.target.value) })} /></label>
            <label className="field">TVQ<input type="number" step="0.01" inputMode="decimal" value={e.tvq} onChange={(ev) => up({ tvq: Number(ev.target.value) })} /></label>
            <label className="field">Payé par
              <select value={e.paymentMethod} onChange={(ev) => up({ paymentMethod: ev.target.value })}>
                {['Carte de crédit', 'Carte de débit', 'Comptant', 'Chèque', 'Virement', 'Carte personnelle (à rembourser)'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="field">Client (optionnel)
              <select value={e.clientId ?? ''} onChange={(ev) => up({ clientId: ev.target.value ? Number(ev.target.value) : undefined })}>
                <option value="">—</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field">Pour la facture (optionnel)
              <select value={e.docId ?? ''} onChange={(ev) => {
                const d = docs.find((x) => x.id === Number(ev.target.value));
                up({ docId: d?.id, clientId: d?.clientId ?? e.clientId });
              }}>
                <option value="">—</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.number} — {d.title}</option>)}
              </select>
            </label>
            <label className="field full">Notes / raison<textarea value={e.notes} onChange={(ev) => up({ notes: ev.target.value })} placeholder="ex.: Essence pour aller chez client Tremblay" /></label>
          </div>
          {e.id && <button className="btn danger small" style={{ marginTop: 12 }} onClick={remove}>🗑 Supprimer</button>}
        </div>
      </div>
    </>
  );
}
