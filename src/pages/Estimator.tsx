import { useLiveQuery } from 'dexie-react-hooks';
import { Calculator, Camera, ClipboardList, Copy, ExternalLink, Lightbulb, Loader2, Plus, Search, ShoppingCart, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientPicker } from '../components/ClientPicker';
import { NumInput } from '../components/NumInput';
import { errMsg, useToast } from '../components/Toast';
import { aiConfigured, aiErrorMessage } from '../lib/ai';
import { db, getSettings, saveSettings, takeNextNumber, type Doc, type LineItem, type MaterialPrice } from '../lib/db';
import { askQuestions, bookMatch, estimateMaterials, findProducts, norm, shrinkPhoto, STORES, type EstMaterial, type EstQuestion, type EstResult, type ProductSearch } from '../lib/estimator';
import { useSettings } from '../lib/hooks';
import { createOrder } from '../lib/orders';
import { addDays, money, round2, todayISO } from '../lib/utils';

const IDEAS = [
  'Salle de bain', 'Revêtement extérieur', 'Soffits et fascias', 'Toiture', 'Plancher', 'Cuisine', 'Peinture intérieure', 'Peinture extérieure',
  'Gypse et plâtre', 'Isolation', 'Terrasse / patio', 'Fenêtres et portes', 'Sous-sol', 'Calfeutrage',
];
const RATE_KEY = 'estimator.rate';
const MARGIN_KEY = 'estimator.margin';
const qtyTxt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Estimateur de projet: photo + questions → matériaux à acheter, coût estimé et liens chez les fournisseurs. */
export default function Estimator() {
  const s = useSettings();
  const nav = useNavigate();
  const notify = useToast();
  const clients = useLiveQuery(() => db.clients.toArray(), []) ?? [];
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [job, setJob] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState('');
  const [questions, setQuestions] = useState<EstQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState('');
  const [res, setRes] = useState<EstResult | null>(null);
  const [rows, setRows] = useState<EstMaterial[]>([]);
  const [hours, setHours] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [found, setFound] = useState<Record<number, ProductSearch | 'loading'>>({});
  const [clientId, setClientId] = useState(0);
  const [rate, setRate] = useState(() => { try { return Number(localStorage.getItem(RATE_KEY)) || 65; } catch { return 65; } });
  const [margin, setMargin] = useState(() => { try { const v = localStorage.getItem(MARGIN_KEY); return v === null ? 15 : Number(v) || 0; } catch { return 15; } });

  const aiOn = aiConfigured(s.aiAssistant);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const list = await Promise.all([...files].slice(0, 6 - photos.length).map(shrinkPhoto));
      setPhotos((p) => [...p, ...list].slice(0, 6));
    } catch (e) {
      notify(errMsg(e), 'err');
    }
  };

  const start = async () => {
    if (!job.trim()) return notify('Décris la job en quelques mots (ex.: « salle de bain complète, douche en céramique »).', 'err');
    setBusy('Je regarde le projet…');
    try {
      const r = await askQuestions(job.trim(), photos);
      setSummary(r.summary);
      setQuestions(r.questions);
      setAnswers({});
      setStep(1);
    } catch (e) {
      notify(aiErrorMessage(e), 'err');
    } finally {
      setBusy('');
    }
  };

  const calculate = async () => {
    setBusy('Je calcule les matériaux…');
    try {
      const a = questions.map((q) => ({ question: q.question + (q.unit ? ` (${q.unit})` : ''), answer: (answers[q.id] ?? '').trim() })).filter((x) => x.answer);
      const r = await estimateMaterials(job.trim(), photos, a, extra.trim());
      const book = s.materialBook;
      setRes(r);
      setRows(r.materials.map((m) => {
        const hit = bookMatch(book, m);
        return hit ? { ...m, price: hit.price, source: 'catalogue' as const, store: hit.store, url: hit.url } : m;
      }));
      setHours(r.hours);
      setEditing(null);
      setStep(2);
    } catch (e) {
      notify(aiErrorMessage(e), 'err');
    } finally {
      setBusy('');
    }
  };

  const lookup = async (i: number) => {
    setFound((f) => ({ ...f, [i]: 'loading' }));
    try {
      const r = await findProducts(rows[i]);
      setFound((f) => ({ ...f, [i]: r }));
    } catch (e) {
      setFound((f) => { const n = { ...f }; delete n[i]; return n; });
      notify(aiErrorMessage(e), 'err');
    }
  };

  const setRow = (i: number, patch: Partial<EstMaterial>) => setRows((r) => r.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  /** Garde un prix réel dans le catalogue: il revient automatiquement dans les prochaines estimations. */
  const savePrice = async (i: number, store: string, price: number, url: string) => {
    const m = rows[i];
    const entry: MaterialPrice = { key: norm(m.query || m.name), name: m.name, store, price, unit: m.unit, url: url.trim() || undefined, at: todayISO() };
    const book = [...(s.materialBook ?? []).filter((p) => p.key !== entry.key), entry];
    await saveSettings({ materialBook: book });
    setRow(i, { price, source: 'catalogue', store, url: entry.url });
    setEditing(null);
    notify('Prix gardé dans ton catalogue');
  };

  const matTotal = rows.reduce((a, m) => a + m.qty * m.price, 0);
  const sell = matTotal * (1 + margin / 100);
  const labour = hours * rate;
  const grouped = useMemo(() => {
    const g = new Map<string, number[]>();
    rows.forEach((m, i) => g.set(m.category, [...(g.get(m.category) ?? []), i]));
    return [...g.entries()];
  }, [rows]);

  const shoppingText = () =>
    [
      `Liste d’achats — ${job.trim().slice(0, 80)}`,
      ...rows.filter((m) => m.qty > 0).map((m) => `• ${qtyTxt(m.qty)} ${m.unit} — ${m.name}${m.url ? `\n   Mon lien: ${m.url}` : ''}\n   ${STORES.slice(0, 3).map((x) => `${x.label}: ${x.url(m.query)}`).join('\n   ')}`),
    ].join('\n');

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(shoppingText());
      notify('Liste d’achats copiée');
    } catch {
      notify('Impossible de copier: ouvre la liste et copie à la main.', 'err');
    }
  };

  const makeOrder = async () => {
    const id = await createOrder(rows.filter((m) => m.qty > 0).map((m) => ({ description: m.name, qty: m.qty, unit: m.unit })), { notes: `Projet: ${job.trim().slice(0, 100)}` });
    nav(`/achats/${id}`);
  };

  const makeQuote = async () => {
    if (!clientId) return notify('Choisis le client pour créer la soumission.', 'err');
    try {
      localStorage.setItem(RATE_KEY, String(rate));
      localStorage.setItem(MARGIN_KEY, String(margin));
    } catch { /* ok */ }
    const st = await getSettings();
    const items: LineItem[] = rows.filter((m) => m.qty > 0).map((m) => ({ description: m.name, unit: m.unit, quantity: m.qty, unitPrice: round2(m.price * (1 + margin / 100)) }));
    if (hours > 0) items.push({ description: 'Main-d’œuvre', unit: 'heure', quantity: hours, unitPrice: rate });
    const now = new Date().toISOString();
    const date = todayISO();
    const client = await db.clients.get(clientId);
    const doc: Doc = {
      type: 'quote', number: await takeNextNumber('quote'), clientId, date, dueDate: addDays(date, st.quoteValidityDays), jobDate: '',
      jobAddress: client?.address ?? '', jobGeo: client?.geo, title: job.trim().replace(/\s+/g, ' ').slice(0, 80), items,
      applyTps: st.chargeTaxes, applyTvq: st.chargeTaxes, notes: st.quoteNotes, status: 'draft', payments: [], createdAt: now, updatedAt: now,
    };
    const id = await db.docs.add(doc);
    notify(`Soumission ${doc.number} créée — vérifie les prix`);
    nav(`/doc/${id}`);
  };

  // ---------- Affichage ----------
  return (
    <div className="estimator">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> Estimateur de projet</div>
          <h1>{step === 0 ? 'Quelle job veux-tu estimer?' : step === 1 ? 'Quelques questions' : 'Matériaux à acheter'}</h1>
        </div>
        {step > 0 && <button className="btn" onClick={() => { setStep(0); setRes(null); }}>Nouveau projet</button>}
      </div>

      {!aiOn && <div className="notice">L’assistant IA n’est pas activé: va dans Paramètres → Assistant IA pour l’activer.</div>}

      {step === 0 && (
        <div className="card">
          <div className="fix-chips" style={{ marginBottom: 10 }}>
            {IDEAS.map((x) => <button key={x} onClick={() => setJob((j) => (j.trim() ? j : `${x}: `))}>{x}</button>)}
          </div>
          <label className="field">Décris la job (n’importe quel type de travaux)
            <textarea rows={4} value={job} onChange={(e) => setJob(e.target.value)} placeholder="ex.: Salle de bain 5 x 8 pi, remplacer le bain par une douche en céramique, nouveau plancher, vanité 30 po" />
          </label>
          <div style={{ marginTop: 12 }}>
            <div className="small muted" style={{ marginBottom: 6 }}>Photos (facultatif, jusqu’à 6): l’IA voit l’état actuel, les murs, les obstacles</div>
            <div className="est-photos">
              {photos.map((p, i) => (
                <div key={i} className="est-ph"><img src={p} alt={`Photo ${i + 1}`} /><button aria-label="Retirer la photo" onClick={() => setPhotos((l) => l.filter((_, j) => j !== i))}><X size={14} /></button></div>
              ))}
              {photos.length < 6 && (
                <label className="est-add"><Camera size={22} /><span>Ajouter</span><input type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} /></label>
              )}
            </div>
          </div>
          <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn accent big" disabled={!!busy || !aiOn} onClick={start}>{busy ? <><Loader2 size={18} className="spin" /> {busy}</> : <>Continuer</>}</button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          {summary && <p style={{ marginTop: 0 }}><strong>J’ai compris:</strong> {summary}</p>}
          <div className="form-grid">
            {questions.map((q) => (
              <label key={q.id} className="field full">{q.question}{q.unit ? ` (${q.unit})` : ''}
                {q.type === 'choix' && q.options?.length ? (
                  <div className="seg" style={{ flexWrap: 'wrap' }}>
                    {q.options.map((o) => <button key={o} type="button" className={answers[q.id] === o ? 'on' : ''} onClick={() => setAnswers((a) => ({ ...a, [q.id]: a[q.id] === o ? '' : o }))}>{o}</button>)}
                  </div>
                ) : (
                  <input value={answers[q.id] ?? ''} inputMode={q.type === 'nombre' ? 'decimal' : 'text'} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                )}
              </label>
            ))}
            <label className="field full">Autre chose à savoir? (facultatif)<textarea rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ex.: client veut du matériel haut de gamme, maison de 1960, accès difficile…" /></label>
          </div>
          <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
            <button className="btn" onClick={() => setStep(0)}>Retour</button>
            <button className="btn accent big" disabled={!!busy} onClick={calculate}>{busy ? <><Loader2 size={18} className="spin" /> {busy}</> : <><Calculator size={18} /> Calculer les matériaux</>}</button>
          </div>
        </div>
      )}

      {step === 2 && res && (
        <>
          {res.summary && <div className="card"><p style={{ margin: 0 }}>{res.summary}</p></div>}
          <div className="notice" style={{ marginTop: 10 }}>
            Prix estimés par l’IA (avant taxes): ils sont là pour t’aider à soumissionner, pas pour remplacer le prix en magasin. Clique sur <strong>« Mon prix »</strong> pour noter le vrai prix: il sera retenu pour tes prochaines estimations.
          </div>

          {grouped.map(([cat, idx]) => (
            <div key={cat} className="card est-cat">
              <div className="card-head"><h2>{cat}</h2></div>
              {idx.map((i) => {
                const m = rows[i];
                return (
                  <div key={i} className="est-row">
                    <div className="est-top">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="est-name">{m.name}</div>
                        {m.note && <div className="small muted">{m.note}</div>}
                      </div>
                      <button className="btn small icon-btn" aria-label="Retirer" onClick={() => { setRows((r) => r.filter((_, j) => j !== i)); setEditing(null); }}><Trash2 size={15} /></button>
                    </div>
                    <div className="est-nums">
                      <label>Qté <NumInput value={m.qty} onChange={(n) => setRow(i, { qty: n })} /></label>
                      <span className="muted">{m.unit}</span>
                      <label>Prix/unité <NumInput value={m.price} onChange={(n) => setRow(i, { price: n, source: 'estime', store: undefined, url: undefined })} /></label>
                      <strong className="est-line">{money(m.qty * m.price)}</strong>
                    </div>
                    <div className="est-src small">
                      {m.source === 'catalogue' ? (
                        <span className="badge green"><Tag size={11} /> Ton prix{m.store ? ` — ${m.store}` : ''}</span>
                      ) : (
                        <span className="badge gray">Prix estimé</span>
                      )}
                      {m.url && <a href={m.url} target="_blank" rel="noreferrer" className="est-mylink"><ExternalLink size={12} /> Ton lien du produit</a>}
                      <button className="btn small" onClick={() => setEditing(editing === i ? null : i)}><Tag size={13} /> Mon prix</button>
                      <button className="btn small" disabled={found[i] === 'loading'} onClick={() => lookup(i)}>{found[i] === 'loading' ? <Loader2 size={13} className="spin" /> : <Search size={13} />} Trouver de vrais produits</button>
                    </div>
                    {found[i] && found[i] !== 'loading' && (
                      <div className="est-found">
                        <div className="small muted">Résultats de la recherche Google (prix lus sur les pages, à confirmer en magasin):</div>
                        <div className="est-found-text">{(found[i] as ProductSearch).text}</div>
                        {(found[i] as ProductSearch).sources.length > 0 && (
                          <div className="est-stores">
                            {(found[i] as ProductSearch).sources.map((x) => <a key={x.url} className="est-store" href={x.url} target="_blank" rel="noreferrer"><ExternalLink size={11} /> {x.domain || x.title}</a>)}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="est-stores">
                      {STORES.map((x) => <a key={x.key} className="est-store" href={x.url(m.query)} target="_blank" rel="noreferrer">{x.label}</a>)}
                    </div>
                    {editing === i && <PriceForm m={m} onCancel={() => setEditing(null)} onSave={(store, price, url) => savePrice(i, store, price, url)} />}
                  </div>
                );
              })}
            </div>
          ))}
          <button className="btn" onClick={() => setRows((r) => [...r, { name: 'Autre matériau', query: 'matériau', category: 'Autres', qty: 1, unit: 'unité', price: 0, source: 'estime' }])}><Plus size={15} /> Ajouter un matériau</button>

          <div className="card est-total">
            <div className="est-trow"><span>Matériaux (coûtant)</span><strong>{money(matTotal)}</strong></div>
            <div className="est-trow"><span>Marge sur les matériaux <NumInput className="est-mini" value={margin} onChange={setMargin} /> %</span><strong>{money(sell - matTotal)}</strong></div>
            <div className="est-trow"><span>Main-d’œuvre <NumInput className="est-mini" value={hours} onChange={setHours} /> h × <NumInput className="est-mini" value={rate} onChange={setRate} /> $/h</span><strong>{money(labour)}</strong></div>
            <div className="est-trow big"><span>Total estimé avant taxes</span><strong>{money(sell + labour)}</strong></div>
            <div className="small muted">Coûtant total (matériaux + main-d’œuvre): {money(matTotal + labour)} · profit prévu {money(sell + labour - matTotal - labour)}</div>
          </div>

          {(res.tips.length > 0 || res.assumptions.length > 0) && (
            <div className="card">
              {res.tips.length > 0 && (<><div className="card-head"><Lightbulb size={18} /><h2>À savoir</h2></div><ul className="est-list">{res.tips.map((t) => <li key={t}>{t}</li>)}</ul></>)}
              {res.assumptions.length > 0 && (<><div className="small muted" style={{ marginTop: 8 }}><strong>Ce que j’ai supposé:</strong></div><ul className="est-list small muted">{res.assumptions.map((t) => <li key={t}>{t}</li>)}</ul></>)}
            </div>
          )}

          <div className="card">
            <div className="card-head"><ClipboardList size={18} /><h2>Et ensuite?</h2></div>
            <label className="field">Client pour la soumission<ClientPicker value={clientId} onChange={setClientId} /></label>
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <button className="btn accent big" disabled={!clients.length && !clientId} onClick={makeQuote}><ClipboardList size={18} /> Créer la soumission</button>
              <button className="btn big" onClick={makeOrder}><ShoppingCart size={18} /> Faire une commande d’achat</button>
              <button className="btn big" onClick={copyList}><Copy size={18} /> Copier la liste d’achats</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PriceForm({ m, onSave, onCancel }: { m: EstMaterial; onSave: (store: string, price: number, url: string) => void; onCancel: () => void }) {
  const [store, setStore] = useState(m.store ?? STORES[0].label);
  const [price, setPrice] = useState(m.price);
  const [url, setUrl] = useState(m.url ?? '');
  return (
    <div className="est-form">
      <div className="small muted">Ouvre le produit chez le fournisseur, note le prix par {m.unit} et colle l’adresse de la page du produit (ça te donne un lien direct pour acheter).</div>
      <div className="form-grid">
        <label className="field">Fournisseur
          <select value={store} onChange={(e) => setStore(e.target.value)}>{[...STORES.map((x) => x.label), 'Autre'].map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="field">Prix par {m.unit} ($)<NumInput value={price} onChange={setPrice} /></label>
        <label className="field full">Lien de la page du produit (facultatif)<input type="url" value={url} placeholder="https://www.homedepot.ca/product/…" onChange={(e) => setUrl(e.target.value)} /></label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn" onClick={onCancel}>Annuler</button>
        <button className="btn accent" disabled={!price} onClick={() => onSave(store, price, url)}>Garder ce prix</button>
      </div>
    </div>
  );
}
