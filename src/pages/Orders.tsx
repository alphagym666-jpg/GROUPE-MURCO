import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Mail, MessageSquare, PackageCheck, Plus, Share2, Trash2, Truck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClientPicker } from '../components/ClientPicker';
import { NumInput } from '../components/NumInput';
import { errMsg, useConfirm, useToast } from '../components/Toast';
import { db, type PurchaseOrder } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { createOrder, ORDER_STATUS, orderText } from '../lib/orders';
import { formatDate } from '../lib/utils';

/** Commandes au fournisseur: liste, ou une commande (/achats/:id). */
export default function Orders() {
  const { id } = useParams();
  return id ? <OrderEditor id={Number(id)} /> : <OrderList />;
}

function OrderList() {
  const nav = useNavigate();
  const notify = useToast();
  const orders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const clients = useLiveQuery(() => db.clients.toArray(), []) ?? [];
  const [tab, setTab] = useState<'ouvertes' | 'recues'>('ouvertes');
  const list = orders.filter((o) => (tab === 'recues' ? o.status === 'recue' : o.status !== 'recue'));
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Truck size={14} /> Achats</div>
          <h1>Commandes au fournisseur</h1>
        </div>
        <button className="btn accent" onClick={async () => { try { nav(`/achats/${await createOrder([{ description: '', qty: 1, unit: 'unité' }])}`); } catch (e) { notify(errMsg(e), 'err'); } }}><Plus size={17} /> Commande</button>
      </div>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={tab === 'ouvertes' ? 'on' : ''} onClick={() => setTab('ouvertes')}>En cours ({orders.filter((o) => o.status !== 'recue').length})</button>
        <button className={tab === 'recues' ? 'on' : ''} onClick={() => setTab('recues')}>Reçues</button>
      </div>
      {list.length === 0 ? (
        <div className="card empty">
          <Truck size={34} />
          <div>{tab === 'recues' ? 'Aucune commande reçue.' : 'Aucune commande en cours.'}</div>
          <div className="small muted">Les calculateurs de « Mon métier » créent la liste d’achats pour toi.</div>
          <Link className="btn" to="/metier">Mon métier</Link>
        </div>
      ) : (
        <div className="order-list">
          {list.map((o) => {
            const c = o.clientId ? clients.find((x) => x.id === o.clientId) : undefined;
            const st = ORDER_STATUS[o.status];
            return (
              <Link key={o.id} to={`/achats/${o.id}`} className="order-row card">
                <div className="or-main">
                  <div className="row" style={{ gap: 8 }}><b>{o.supplier || 'Fournisseur à choisir'}</b><span className={`badge ${st.cls}`}>{st.label}</span></div>
                  <div className="small muted">{o.number} · {o.items.filter((i) => i.description.trim()).length} article{o.items.length > 1 ? 's' : ''}{c ? ` · ${c.name}` : ''}{o.neededBy ? ` · pour le ${formatDate(o.neededBy)}` : ''}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function OrderEditor({ id }: { id: number }) {
  const nav = useNavigate();
  const notify = useToast();
  const ask = useConfirm();
  const s = useSettings();
  const saved = useLiveQuery(() => db.orders.get(id), [id]);
  const all = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const clients = useLiveQuery(() => db.clients.toArray(), []) ?? [];
  const [o, setO] = useState<PurchaseOrder | null>(null);
  useEffect(() => { if (saved && !o) setO(saved); }, [saved, o]);
  if (saved === undefined && !o) return null;
  if (!o) return <div className="card empty">Commande introuvable. <Link to="/achats">Retour</Link></div>;

  const up = (p: Partial<PurchaseOrder>) => {
    const n = { ...o, ...p };
    setO(n);
    void db.orders.put(n);
  };
  const suppliers = [...new Map(all.filter((x) => x.supplier.trim()).map((x) => [x.supplier.trim().toLowerCase(), x])).values()];
  const pickSupplier = (name: string) => {
    const prev = suppliers.find((x) => x.supplier.trim().toLowerCase() === name.trim().toLowerCase());
    up(prev ? { supplier: name, supplierEmail: o.supplierEmail || prev.supplierEmail, supplierPhone: o.supplierPhone || prev.supplierPhone } : { supplier: name });
  };
  const client = o.clientId ? clients.find((x) => x.id === o.clientId) : undefined;
  const text = orderText(o, s.companyName, client ? `job ${client.name}` : undefined);
  const subject = `Commande ${o.number} — ${s.companyName}`;
  const sent = () => o.status === 'brouillon' && up({ status: 'envoyee', sentAt: new Date().toISOString() });
  const items = o.items;
  const setItem = (i: number, p: Partial<PurchaseOrder['items'][number]>) => up({ items: items.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  return (
    <div className="order-edit">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Truck size={14} /> Commande {o.number}</div>
          <h1>{o.supplier || 'Nouvelle commande'}</h1>
        </div>
        <span className={`badge ${ORDER_STATUS[o.status].cls}`}>{ORDER_STATUS[o.status].label}</span>
      </div>

      <div className="card">
        <h2>Fournisseur</h2>
        <div className="form-grid">
          <label className="field full">Nom
            <input list="suppliers" value={o.supplier} placeholder="ex.: Rona Laval, Sherwin-Williams…" onChange={(e) => pickSupplier(e.target.value)} />
            <datalist id="suppliers">{suppliers.map((x) => <option key={x.supplier} value={x.supplier} />)}</datalist>
          </label>
          <label className="field">Courriel<input type="email" value={o.supplierEmail} onChange={(e) => up({ supplierEmail: e.target.value })} /></label>
          <label className="field">Téléphone (texto)<input type="tel" value={o.supplierPhone} onChange={(e) => up({ supplierPhone: e.target.value })} /></label>
        </div>
      </div>

      <div className="card">
        <h2>Articles</h2>
        <div className="oi-list">
          {items.map((it, i) => (
            <div key={i} className="oi-row">
              <NumInput value={it.qty} onChange={(n) => setItem(i, { qty: n })} aria-label="Quantité" className="oi-qty" />
              <input className="oi-unit" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} aria-label="Unité" />
              <input className="oi-desc" value={it.description} placeholder="Article (ex.: BM Regal velours OC-17)" onChange={(e) => setItem(i, { description: e.target.value })} aria-label="Article" />
              <button className="btn small icon-btn" onClick={() => up({ items: items.filter((_, j) => j !== i) })} aria-label="Retirer"><X size={15} /></button>
            </div>
          ))}
        </div>
        <button className="btn small" onClick={() => up({ items: [...items, { description: '', qty: 1, unit: 'unité' }] })}><Plus size={15} /> Article</button>
      </div>

      <div className="card">
        <h2>Pour quand</h2>
        <div className="form-grid">
          <label className="field">Date voulue<input type="date" value={o.neededBy ?? ''} onChange={(e) => up({ neededBy: e.target.value || undefined })} /></label>
          <div className="field">Réception
            <div className="seg">
              <button className={o.pickup ? 'on' : ''} onClick={() => up({ pickup: true })}>Je passe chercher</button>
              <button className={!o.pickup ? 'on' : ''} onClick={() => up({ pickup: false })}>Livraison</button>
            </div>
          </div>
          <div className="field full">Pour la job de (facultatif)<ClientPicker value={o.clientId ?? 0} onChange={(cid) => up({ clientId: cid })} /></div>
          <label className="field full">Note au fournisseur<textarea rows={2} value={o.notes} onChange={(e) => up({ notes: e.target.value })} /></label>
        </div>
      </div>

      <div className="card">
        <h2>Envoyer</h2>
        <pre className="order-preview">{text}</pre>
        <div className="row" style={{ gap: 8 }}>
          <a className={`btn accent ${o.supplierPhone ? '' : 'disabled'}`} href={o.supplierPhone ? `sms:${o.supplierPhone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(text)}` : undefined} onClick={(e) => { if (!o.supplierPhone) { e.preventDefault(); notify('Ajoute le téléphone du fournisseur.', 'err'); } else sent(); }}><MessageSquare size={16} /> Texto</a>
          <a className="btn" href={`mailto:${encodeURIComponent(o.supplierEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`} onClick={sent}><Mail size={16} /> Courriel</a>
          {'share' in navigator && <button className="btn" onClick={() => navigator.share({ title: subject, text }).then(sent).catch(() => undefined)}><Share2 size={16} /> Partager</button>}
        </div>
      </div>

      <div className="row order-actions">
        <button className="btn danger" onClick={async () => { if (await ask({ title: 'Supprimer cette commande?', confirm: 'Supprimer', danger: true })) { await db.orders.delete(o.id!); nav('/achats'); } }}><Trash2 size={16} /> Supprimer</button>
        <span className="spacer" />
        {o.status === 'brouillon' && <button className="btn" onClick={() => up({ status: 'envoyee', sentAt: new Date().toISOString() })}><Check size={16} /> Marquer envoyée</button>}
        {o.status !== 'recue' && <button className="btn accent" onClick={() => { up({ status: 'recue', receivedAt: new Date().toISOString() }); notify('Commande reçue'); }}><PackageCheck size={16} /> Reçue</button>}
      </div>
    </div>
  );
}
