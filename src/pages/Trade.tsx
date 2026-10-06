import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calculator, Check, ChevronDown, Copy, Droplets, Grid3x3, Hammer, House, Layers, Leaf, Package, PaintRoller, Plus, Rows3, Shovel,
  Snowflake, SprayCan, Trash2, Truck, Wrench, X, type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { lineFromService } from '../components/LineItems';
import { Modal } from '../components/Modal';
import { NumInput } from '../components/NumInput';
import { errMsg, useToast } from '../components/Toast';
import { blankJob, optimizeDay } from '../lib/agenda';
import { db, saveSettings, type Settings, type StockItem } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { activeTrades, createOrder, TOOL_LABEL, TRADE_TOOLS, type ToolKey } from '../lib/orders';
import { TRADES } from '../lib/templates';
import {
  buyLabel, cleanCalc, drywallCalc, floorCalc, gutterCalc, L_PER_GAL, mulchCalc, paintCalc, tileCalc,
  plural, type CleanInput, type Material, type Room,
} from '../lib/tradeCalc';
import { addDays, todayISO } from '../lib/utils';
import { useWeather } from '../lib/weather';

const TRADE_ICON: Record<string, LucideIcon> = {
  exterieur: House, paysagement: Leaf, peinture: PaintRoller, menage: SprayCan, deneigement: Snowflake, renovation: Hammer, general: Wrench,
};
const TOOL_ICON: Record<ToolKey, LucideIcon> = {
  paint: PaintRoller, tile: Grid3x3, drywall: Layers, floor: Rows3, mulch: Shovel, gutter: Droplets, clean: SprayCan, snow: Snowflake,
};
const num = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('fr-CA');

/** Outils du métier: calculateurs de matériaux, commandes au fournisseur, matériaux en main, déneigement. */
export default function Trade() {
  const s = useSettings();
  const [params, setParams] = useSearchParams();
  const trades = activeTrades(s);
  const [manage, setManage] = useState(false);
  const cur = params.get('m') && trades.includes(params.get('m')!) ? params.get('m')! : trades[0];
  const tools = TRADE_TOOLS[cur] ?? [];
  const open = (params.get('outil') as ToolKey | 'stock' | null) ?? (tools.length === 1 ? tools[0] : null);
  const setOpen = (t: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (t) n.set('outil', t); else n.delete('outil'); return n; }, { replace: true });
  const trade = TRADES.find((t) => t.key === cur);
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const openOrders = orders.filter((o) => o.status !== 'recue').length;

  return (
    <div className="trade">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Wrench size={14} /> Mon métier</div>
          <h1>{trade ? trade.label : 'Outils'}</h1>
        </div>
        <button className="btn" onClick={() => setManage(true)}>Mes métiers</button>
      </div>

      {trades.length > 1 && (
        <div className="seg trade-tabs" role="tablist">
          {trades.map((k) => {
            const t = TRADES.find((x) => x.key === k)!;
            const Icon = TRADE_ICON[k] ?? Wrench;
            return <button key={k} role="tab" aria-selected={k === cur} className={k === cur ? 'on' : ''} onClick={() => setParams({ m: k }, { replace: true })}><Icon size={15} /> {t.label}</button>;
          })}
        </div>
      )}

      <div className="tool-list">
        {tools.map((k) => (
          <ToolCard key={k} icon={TOOL_ICON[k]} title={TOOL_LABEL[k].title} desc={TOOL_LABEL[k].desc} open={open === k} onToggle={() => setOpen(open === k ? null : k)}>
            {k === 'paint' && <PaintTool />}
            {k === 'tile' && <TileTool />}
            {k === 'drywall' && <DrywallTool />}
            {k === 'floor' && <FloorTool />}
            {k === 'mulch' && <MulchTool />}
            {k === 'gutter' && <GutterTool />}
            {k === 'clean' && <CleanTool />}
            {k === 'snow' && <SnowTool s={s} />}
          </ToolCard>
        ))}
        <Link to="/achats" className="tool-card link">
          <div className="tool-head">
            <span className="tool-ic"><Truck size={20} /></span>
            <span className="tool-txt"><b>Commandes au fournisseur</b><small>{openOrders ? `${openOrders} en cours` : 'Envoie ta liste d’achats par texto ou courriel'}</small></span>
            <ChevronDown size={18} className="tool-chev side" />
          </div>
        </Link>
        <ToolCard icon={Package} title="Matériaux en main" desc="Restes de peinture, boîtes de tuiles… pour ne pas racheter" open={open === 'stock'} onToggle={() => setOpen(open === 'stock' ? null : 'stock')}>
          <StockPanel />
        </ToolCard>
      </div>

      {manage && <TradesModal s={s} onClose={() => setManage(false)} />}
    </div>
  );
}

function ToolCard({ icon: Icon, title, desc, open, onToggle, children }: { icon: LucideIcon; title: string; desc: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={`tool-card ${open ? 'open' : ''}`}>
      <button className="tool-head" onClick={onToggle} aria-expanded={open}>
        <span className="tool-ic"><Icon size={20} /></span>
        <span className="tool-txt"><b>{title}</b><small>{desc}</small></span>
        <ChevronDown size={18} className="tool-chev" />
      </button>
      {open && <div className="tool-body">{children}</div>}
    </section>
  );
}

function TradesModal({ s, onClose }: { s: Settings; onClose: () => void }) {
  const [sel, setSel] = useState<string[]>(activeTrades(s));
  const toggle = (k: string) => setSel((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));
  return (
    <Modal title="Mes métiers" onClose={onClose}>
      <p className="small muted">Choisis tout ce que tu fais: l’app te montre les outils de chaque métier.</p>
      <div className="trade-pick">
        {TRADES.map((t) => {
          const Icon = TRADE_ICON[t.key] ?? Wrench;
          return (
            <button key={t.key} className={`trade-opt ${sel.includes(t.key) ? 'on' : ''}`} onClick={() => toggle(t.key)} aria-pressed={sel.includes(t.key)}>
              <Icon size={18} /><span><b>{t.label}</b><small>{t.desc}</small></span>{sel.includes(t.key) && <Check size={18} />}
            </button>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn accent" disabled={!sel.length} onClick={async () => { await saveSettings({ trades: sel }); onClose(); }}>Enregistrer</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Résultat commun

function Materials({ items, note }: { items: Material[]; note?: string }) {
  const nav = useNavigate();
  const notify = useToast();
  if (!items.length) return null;
  const text = items.map((m) => `${num(m.qty, 2)} ${plural(m.unit, m.qty)} — ${m.description}`).join('\n');
  return (
    <div className="mat">
      <div className="mat-title">À acheter</div>
      <ul>{items.map((m) => <li key={m.description + m.unit}><b>{num(m.qty, 2)}</b> <span className="muted">{plural(m.unit, m.qty)}</span> <span>{m.description}</span></li>)}</ul>
      {note && <div className="small muted">{note}</div>}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn accent" onClick={async () => { try { nav(`/achats/${await createOrder(items)}`); } catch (e) { notify(errMsg(e), 'err'); } }}><Truck size={16} /> Commander au fournisseur</button>
        <button className="btn" onClick={() => navigator.clipboard?.writeText(text).then(() => notify('Liste copiée'))}><Copy size={16} /> Copier</button>
      </div>
    </div>
  );
}

const F = ({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) => <label className={`field ${full ? 'full' : ''}`}>{label}{children}</label>;

// ------------------------------------------------------------------ Peinture

const blankRoom = (n: number): Room => ({ name: `Pièce ${n}`, length: 12, width: 10, height: 8, doors: 1, windows: 1, ceiling: true });

function PaintTool() {
  const notify = useToast();
  const [rooms, setRooms] = useState<Room[]>([blankRoom(1)]);
  const [extra, setExtra] = useState(0);
  const [coats, setCoats] = useState(2);
  const [coverage, setCoverage] = useState(375);
  const [primer, setPrimer] = useState(false);
  const [margin, setMargin] = useState(10);
  const stock = useLiveQuery(() => db.stock.where('kind').equals('peinture').toArray(), []) ?? [];
  const [useStock, setUseStock] = useState<number | ''>('');
  const st = stock.find((x) => x.id === useStock);
  const inStock = st ? (st.unit === 'litre' ? st.qty / L_PER_GAL : st.qty) : 0;
  const r = paintCalc({ rooms, extraArea: extra, coats, coverage, primer, margin, inStock });
  const wallLeft = Math.max(0, r.wallBuy.total + inStock - r.wallGallons);
  const ceilLeft = Math.max(0, r.ceilingBuy.total - r.ceilingGallons);
  const primerLeft = Math.max(0, r.primerBuy.total - r.primerGallons);
  const [color, setColor] = useState('');
  const upRoom = (i: number, p: Partial<Room>) => setRooms((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const keep = async () => {
    const now = new Date().toISOString();
    const put = async (name: string, qty: number, existing?: StockItem) => {
      if (qty < 0.05 && !existing) return;
      if (existing) await db.stock.update(existing.id!, { qty: Math.round(qty * 100) / 100, unit: 'gallon', updatedAt: now });
      else await db.stock.add({ kind: 'peinture', name, qty: Math.round(qty * 100) / 100, unit: 'gallon', notes: '', updatedAt: now });
    };
    await put(color.trim() || st?.name || 'Peinture murs', wallLeft, st);
    await put('Peinture plafond', ceilLeft);
    await put('Apprêt', primerLeft);
    notify('Restes ajoutés aux matériaux en main');
  };

  return (
    <div className="calc">
      {rooms.map((rm, i) => (
        <div key={i} className="room">
          <div className="row" style={{ gap: 8 }}>
            <input className="room-name" value={rm.name} onChange={(e) => upRoom(i, { name: e.target.value })} aria-label="Nom de la pièce" />
            <span className="small muted">{num(Math.max(0, 2 * (rm.length + rm.width) * rm.height - rm.doors * 21 - rm.windows * 15), 0)} pi² de murs</span>
            <span className="spacer" />
            {rooms.length > 1 && <button className="btn small icon-btn" onClick={() => setRooms((l) => l.filter((_, j) => j !== i))} aria-label="Retirer la pièce"><X size={15} /></button>}
          </div>
          <div className="form-grid calc-grid">
            <F label="Longueur (pi)"><NumInput value={rm.length} onChange={(n) => upRoom(i, { length: n })} /></F>
            <F label="Largeur (pi)"><NumInput value={rm.width} onChange={(n) => upRoom(i, { width: n })} /></F>
            <F label="Hauteur (pi)"><NumInput value={rm.height} onChange={(n) => upRoom(i, { height: n })} /></F>
            <F label="Portes"><NumInput value={rm.doors} onChange={(n) => upRoom(i, { doors: Math.round(n) })} /></F>
            <F label="Fenêtres"><NumInput value={rm.windows} onChange={(n) => upRoom(i, { windows: Math.round(n) })} /></F>
            <label className="check calc-check"><input type="checkbox" checked={rm.ceiling} onChange={(e) => upRoom(i, { ceiling: e.target.checked })} /> Plafond</label>
          </div>
        </div>
      ))}
      <button className="btn small" onClick={() => setRooms((l) => [...l, blankRoom(l.length + 1)])}><Plus size={15} /> Ajouter une pièce</button>

      <div className="form-grid calc-grid" style={{ marginTop: 14 }}>
        <F label="Couches">
          <div className="seg">{[1, 2, 3].map((c) => <button key={c} className={coats === c ? 'on' : ''} onClick={() => setCoats(c)}>{c}</button>)}</div>
        </F>
        <F label="Rendement (pi²/gallon)"><NumInput value={coverage} onChange={setCoverage} /></F>
        <F label="Marge (%)"><NumInput value={margin} onChange={setMargin} /></F>
        <F label="Autre surface (pi²)"><NumInput value={extra} onChange={setExtra} placeholder="ex.: corridor" /></F>
        <label className="check calc-check"><input type="checkbox" checked={primer} onChange={(e) => setPrimer(e.target.checked)} /> Une couche d’apprêt</label>
        {stock.length > 0 && (
          <F label="Reste déjà en main (même couleur)" full>
            <select value={useStock} onChange={(e) => setUseStock(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Aucun</option>
              {stock.map((x) => <option key={x.id} value={x.id}>{x.name} — {num(x.qty, 2)} {x.unit}</option>)}
            </select>
          </F>
        )}
      </div>

      <div className="calc-out">
        <div className="big-num"><span>Murs</span><b>{num(r.wallGallons)} gal</b><small>{num(r.wallArea, 0)} pi² × {coats} couche{coats > 1 ? 's' : ''}{inStock ? ` · ${num(inStock, 2)} gal en main` : ''}</small><em>{buyLabel(r.wallBuy)}</em></div>
        {r.ceilingArea > 0 && <div className="big-num"><span>Plafonds</span><b>{num(r.ceilingGallons)} gal</b><small>{num(r.ceilingArea, 0)} pi²</small><em>{buyLabel(r.ceilingBuy)}</em></div>}
        {primer && <div className="big-num"><span>Apprêt</span><b>{num(r.primerGallons)} gal</b><small>1 couche</small><em>{buyLabel(r.primerBuy)}</em></div>}
      </div>
      <div className={`leftover ${r.leftover > 0 ? '' : 'none'}`}>
        <PaintRoller size={16} />
        <span>Il va te rester environ <b>{num(r.leftover)} gallon{r.leftover >= 2 ? 's' : ''}</b> ({num(r.leftover * L_PER_GAL)} L) après la job.</span>
      </div>
      <Materials items={r.materials.map((m) => (m.description === 'Peinture murs' && (color.trim() || st) ? { ...m, description: `Peinture murs — ${color.trim() || st!.name}` } : m))} note="Calcul avec une marge pour les retouches. Les rendements varient selon la surface: vérifie l’étiquette du produit." />
      {r.leftover > 0.05 && (
        <div className="keep">
          <input value={color} onChange={(e) => setColor(e.target.value)} placeholder={st?.name ?? 'Couleur et marque (ex.: BM OC-17 velours)'} aria-label="Couleur" />
          <button className="btn" onClick={() => void keep()}><Package size={16} /> Garder le reste</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Rénovation

function TileTool() {
  const [l, setL] = useState(10);
  const [w, setW] = useState(10);
  const [waste, setWaste] = useState(10);
  const [box, setBox] = useState(12);
  const r = tileCalc({ area: l * w, waste, boxCoverage: box });
  return (
    <div className="calc">
      <div className="form-grid calc-grid">
        <F label="Longueur (pi)"><NumInput value={l} onChange={setL} /></F>
        <F label="Largeur (pi)"><NumInput value={w} onChange={setW} /></F>
        <F label="Perte (%)">
          <div className="seg">{[10, 15].map((x) => <button key={x} className={waste === x ? 'on' : ''} onClick={() => setWaste(x)}>{x} %{x === 15 ? ' diag.' : ''}</button>)}</div>
        </F>
        <F label="pi² par boîte"><NumInput value={box} onChange={setBox} /></F>
      </div>
      <div className="calc-out"><div className="big-num"><span>Surface</span><b>{r.area} pi²</b><small>{r.withWaste} pi² avec la perte</small><em>{r.boxes} boîtes</em></div></div>
      <Materials items={r.materials} />
    </div>
  );
}

function DrywallTool() {
  const [walls, setWalls] = useState(800);
  const [ceil, setCeil] = useState(200);
  const [size, setSize] = useState<32 | 48>(32);
  const r = drywallCalc({ wallArea: walls, ceilingArea: ceil, sheetSize: size, waste: 10 });
  return (
    <div className="calc">
      <div className="form-grid calc-grid">
        <F label="Murs (pi²)"><NumInput value={walls} onChange={setWalls} /></F>
        <F label="Plafonds (pi²)"><NumInput value={ceil} onChange={setCeil} /></F>
        <F label="Feuilles">
          <div className="seg">{([32, 48] as const).map((x) => <button key={x} className={size === x ? 'on' : ''} onClick={() => setSize(x)}>4 × {x === 32 ? 8 : 12}</button>)}</div>
        </F>
      </div>
      <div className="calc-out"><div className="big-num"><span>Surface</span><b>{r.area} pi²</b><small>+ 10 % de perte</small><em>{r.sheets} feuilles</em></div></div>
      <Materials items={r.materials} />
    </div>
  );
}

function FloorTool() {
  const [l, setL] = useState(15);
  const [w, setW] = useState(12);
  const [box, setBox] = useState(20);
  const [under, setUnder] = useState(true);
  const r = floorCalc({ length: l, width: w, waste: 10, boxCoverage: box, underlay: under });
  return (
    <div className="calc">
      <div className="form-grid calc-grid">
        <F label="Longueur (pi)"><NumInput value={l} onChange={setL} /></F>
        <F label="Largeur (pi)"><NumInput value={w} onChange={setW} /></F>
        <F label="pi² par boîte"><NumInput value={box} onChange={setBox} /></F>
        <label className="check calc-check"><input type="checkbox" checked={under} onChange={(e) => setUnder(e.target.checked)} /> Sous-plancher</label>
      </div>
      <div className="calc-out"><div className="big-num"><span>Surface</span><b>{r.area} pi²</b><small>+ 10 % de perte</small><em>{r.boxes} boîtes</em></div></div>
      <Materials items={r.materials} />
    </div>
  );
}

// ------------------------------------------------------------------ Paysagement / extérieur / ménage

function MulchTool() {
  const [area, setArea] = useState(300);
  const [depth, setDepth] = useState(3);
  const [bag, setBag] = useState(2);
  const r = mulchCalc({ area, depthIn: depth, bagCuFt: bag });
  return (
    <div className="calc">
      <div className="form-grid calc-grid">
        <F label="Superficie (pi²)"><NumInput value={area} onChange={setArea} /></F>
        <F label="Épaisseur (po)"><NumInput value={depth} onChange={setDepth} /></F>
        <F label="Sac (pi³)"><NumInput value={bag} onChange={setBag} /></F>
      </div>
      <div className="calc-out">
        <div className="big-num"><span>En vrac</span><b>{num(r.yards)} verge³</b><small>{num(r.cuFt)} pi³</small></div>
        <div className="big-num"><span>En sacs</span><b>{r.bags} sacs</b><small>de {num(bag)} pi³</small></div>
      </div>
      <Materials items={r.yards >= 1 ? r.materials : r.bagMaterials} />
    </div>
  );
}

function GutterTool() {
  const [l, setL] = useState(40);
  const [w, setW] = useState(28);
  const [storeys, setStoreys] = useState(2);
  const r = gutterCalc({ length: l, width: w, storeys });
  return (
    <div className="calc">
      <div className="form-grid calc-grid">
        <F label="Longueur de la maison (pi)"><NumInput value={l} onChange={setL} /></F>
        <F label="Profondeur (pi)"><NumInput value={w} onChange={setW} /></F>
        <F label="Étages">
          <div className="seg">{[1, 2, 3].map((x) => <button key={x} className={storeys === x ? 'on' : ''} onClick={() => setStoreys(x)}>{x}</button>)}</div>
        </F>
      </div>
      <div className="calc-out">
        <div className="big-num"><span>Gouttières</span><b>{r.gutters} pi</b><small>les deux longs côtés + 5 %</small></div>
        <div className="big-num"><span>Descentes</span><b>{r.downspouts}</b><small>{r.downspoutFt} pi au total</small></div>
      </div>
      <Materials items={r.materials} />
    </div>
  );
}

function CleanTool() {
  const [area, setArea] = useState(1500);
  const [kind, setKind] = useState<CleanInput['kind']>('regulier');
  const [workers, setWorkers] = useState(2);
  const r = cleanCalc({ area, kind, workers });
  return (
    <div className="calc">
      <div className="form-grid calc-grid">
        <F label="Superficie (pi²)"><NumInput value={area} onChange={setArea} /></F>
        <F label="Personnes"><NumInput value={workers} onChange={(n) => setWorkers(Math.max(1, Math.round(n)))} /></F>
        <F label="Type" full>
          <div className="seg">{(['regulier', 'grand', 'construction'] as const).map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'regulier' ? 'Régulier' : k === 'grand' ? 'Grand ménage' : 'Après constr.'}</button>)}</div>
        </F>
      </div>
      <div className="calc-out">
        <div className="big-num"><span>Heures à facturer</span><b>{num(r.hours, 2)} h</b><small>main-d’œuvre totale</small></div>
        <div className="big-num"><span>Durée sur place</span><b>{num(r.duration, 2)} h</b><small>avec {workers} personne{workers > 1 ? 's' : ''}</small></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Déneigement

function SnowTool({ s }: { s: Settings }) {
  const nav = useNavigate();
  const notify = useToast();
  const wx = useWeather(s.homeGeo);
  const threshold = s.snowThresholdCm ?? 5;
  const clients = useLiveQuery(() => db.clients.toArray(), []) ?? [];
  const contract = clients.filter((c) => c.snowContract);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState('');
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i)), []);

  const plan = async (date: string) => {
    setBusy(date);
    try {
      const services = await db.services.toArray();
      const sv = services.find((x) => x.code === 'APP') ?? services.find((x) => /neige/i.test(x.name));
      const existing = await db.jobs.where('date').equals(date).toArray();
      let n = 0;
      for (const c of contract) {
        if (existing.some((j) => j.clientId === c.id && j.status !== 'annule')) continue;
        await db.jobs.add({ ...blankJob(date, c.id!), title: 'Déneigement', address: c.address, durationMin: 20, items: sv ? [lineFromService(sv, 1, c.lang ?? 'fr')] : [], order: Date.now() + n });
        n++;
      }
      await optimizeDay(date).catch(() => undefined);
      notify(n ? `Tournée planifiée: ${n} client${n > 1 ? 's' : ''}, dans l’ordre le plus court` : 'Tous les clients sont déjà planifiés ce jour-là');
      nav(`/agenda?d=${date}&v=jour`);
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="calc">
      {!s.homeGeo && <div className="notice">Ajoute l’adresse de ton domicile dans Paramètres pour voir la neige prévue chez vous.</div>}
      <F label="Partir la tournée à partir de">
        <div className="seg">{[2, 5, 10, 15].map((x) => <button key={x} className={threshold === x ? 'on' : ''} onClick={() => void saveSettings({ snowThresholdCm: x })}>{x} cm</button>)}</div>
      </F>
      <div className="snow-days">
        {days.map((d) => {
          const w = wx[d];
          const cm = w?.snow ?? 0;
          const storm = cm >= threshold;
          const label = new Date(d + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric' });
          return (
            <div key={d} className={`snow-day ${storm ? 'storm' : ''}`}>
              <span className="sd-day">{d === todayISO() ? 'Auj.' : label}</span>
              <Snowflake size={16} className="sd-ic" />
              <b>{w ? `${num(cm)} cm` : '—'}</b>
              {w && <small>{w.tmin}° / {w.tmax}°</small>}
              {storm && contract.length > 0 && <button className="btn small accent" disabled={!!busy} onClick={() => void plan(d)}>{busy === d ? '…' : 'Planifier'}</button>}
            </div>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <span><b>{contract.length}</b> client{contract.length > 1 ? 's' : ''} sous contrat</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => setPick(true)}>Choisir les clients</button>
        {contract.length > 0 && <button className="btn small" disabled={!!busy} onClick={() => void plan(todayISO())}>Tournée aujourd’hui</button>}
      </div>
      {pick && <ContractModal onClose={() => setPick(false)} />}
    </div>
  );
}

function ContractModal({ onClose }: { onClose: () => void }) {
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const [on, setOn] = useState<Record<number, boolean>>({}); // réponse immédiate à la case
  const toggle = (id: number, v: boolean) => {
    setOn((m) => ({ ...m, [id]: v }));
    void db.clients.update(id, { snowContract: v });
  };
  const list = clients.filter((c) => !q.trim() || `${c.name} ${c.address}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Clients sous contrat de déneigement" onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un client…" style={{ marginBottom: 10 }} />
      <div className="pick-list">
        {list.map((c) => (
          <label key={c.id} className="pick-row">
            <input type="checkbox" checked={on[c.id!] ?? !!c.snowContract} onChange={(e) => toggle(c.id!, e.target.checked)} />
            <span><b>{c.name}</b><small className="muted">{c.address || 'Pas d’adresse'}</small></span>
          </label>
        ))}
        {!list.length && <div className="small muted">Aucun client.</div>}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn accent" onClick={onClose}>OK</button></div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Matériaux en main

function StockPanel() {
  const items = useLiveQuery(() => db.stock.orderBy('name').toArray(), []) ?? [];
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('gallon');
  const [kind, setKind] = useState('peinture');
  useEffect(() => { if (kind === 'peinture') setUnit('gallon'); else if (unit === 'gallon') setUnit('boîte'); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    if (!name.trim()) return;
    await db.stock.add({ kind, name: name.trim(), qty, unit, notes: '', updatedAt: new Date().toISOString() });
    setName('');
    setQty(1);
  };
  return (
    <div className="calc">
      {items.length === 0 ? (
        <div className="small muted">Rien en main pour l’instant. Les restes du calculateur de peinture arrivent ici.</div>
      ) : (
        <div className="stock-list">
          {items.map((x) => (
            <div key={x.id} className="stock-row">
              <span className="stock-name"><b>{x.name}</b><small className="muted">{x.kind}</small></span>
              <NumInput value={x.qty} onChange={(n) => void db.stock.update(x.id!, { qty: n, updatedAt: new Date().toISOString() })} aria-label={`Quantité de ${x.name}`} />
              <span className="small muted stock-unit">{x.unit}</span>
              <button className="btn small icon-btn" onClick={() => void db.stock.delete(x.id!)} aria-label={`Retirer ${x.name}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="stock-add">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="peinture">Peinture</option><option value="ceramique">Céramique</option><option value="plancher">Plancher</option><option value="gypse">Gypse</option><option value="autre">Autre</option>
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (couleur, modèle…)" aria-label="Nom" />
        <NumInput value={qty} onChange={setQty} aria-label="Quantité" />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unité" />
        <button className="btn" onClick={() => void add()}><Plus size={16} /> Ajouter</button>
      </div>
      <div className="small muted" style={{ marginTop: 6 }}><Calculator size={12} /> Le calculateur de peinture déduit ce que tu as déjà en main.</div>
    </div>
  );
}
