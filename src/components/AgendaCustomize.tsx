import { ChevronDown, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_AGENDA, JOB_COLORS, saveAgendaPrefs, useAgendaPrefs, type AgendaPrefs, type ColorBy, type Density } from '../lib/agendaPrefs';
import { JOB_ICONS, jobIcon } from '../lib/jobIcons';
import { useSettings } from '../lib/hooks';
import { Modal } from './Modal';

const COLOR_BY: { key: ColorBy; label: string }[] = [
  { key: 'employe', label: 'Employé' },
  { key: 'type', label: 'Type de job' },
  { key: 'statut', label: 'Statut' },
  { key: 'client', label: 'Client' },
];
const DENSITY: { key: Density; label: string }[] = [
  { key: 'compact', label: 'Compacte' },
  { key: 'normal', label: 'Normale' },
  { key: 'aere', label: 'Aérée' },
];
const VIEWS: { key: AgendaPrefs['defaultView']; label: string }[] = [
  { key: '', label: 'Auto' },
  { key: 'jour', label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'liste', label: 'Liste' },
];
const hourLabel = (h: number) => `${h} h`;

/** Personnaliser l'agenda: thème, couleurs, types de jobs, heures, densité. Chaque changement s'applique tout de suite. */
export function AgendaCustomize({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const saved = useAgendaPrefs();
  const [p, setP] = useState<AgendaPrefs>(saved);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(s);
  latest.current = s;

  const set = (patch: Partial<AgendaPrefs>) => {
    setP((x) => {
      const next = { ...x, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveAgendaPrefs(latest.current, next), 250);
      return next;
    });
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const setType = (i: number, patch: Partial<AgendaPrefs['types'][number]>) => set({ types: p.types.map((t, k) => (k === i ? { ...t, ...patch } : t)) });

  return (
    <Modal title="Personnaliser l’agenda" onClose={onClose}>
      <div className="agc">
        <section>
          <h3>Couleur des jobs selon</h3>
          <div className="fix-chips">
            {COLOR_BY.map((c) => <button key={c.key} className={p.colorBy === c.key ? 'on' : ''} onClick={() => set({ colorBy: c.key })}>{c.label}</button>)}
          </div>
          <p className="small muted">Tu peux aussi donner une couleur précise à une job dans sa fiche.</p>
        </section>

        <section>
          <h3>Types de jobs</h3>
          <div className="agc-types">
            {p.types.map((t, i) => {
              const Icon = jobIcon(t.icon);
              return (
                <div key={t.key} className={`agc-type ${openRow === i ? 'open' : ''}`} style={{ ['--c' as string]: t.color }}>
                  <div className="agc-type-row">
                    <button type="button" className="agc-type-pick" aria-label={`Icône et couleur de ${t.label}`} aria-expanded={openRow === i} onClick={() => setOpenRow(openRow === i ? null : i)}>
                      <span className="agc-ico"><Icon size={16} /></span>
                      <ChevronDown size={14} />
                    </button>
                    <input value={t.label} aria-label="Nom du type" onChange={(e) => setType(i, { label: e.target.value })} />
                    <button className="btn small icon-btn" aria-label={`Retirer ${t.label}`} onClick={() => { setOpenRow(null); set({ types: p.types.filter((_, k) => k !== i) }); }} disabled={p.types.length <= 1}><Trash2 size={14} /></button>
                  </div>
                  {openRow === i && (
                    <div className="agc-type-panel">
                      <div className="agc-icons" role="radiogroup" aria-label="Icône">
                        {Object.entries(JOB_ICONS).filter(([k]) => k !== 'circle').map(([k, I]) => (
                          <button key={k} type="button" role="radio" aria-checked={t.icon === k} aria-label={k} className={t.icon === k ? 'on' : ''} onClick={() => setType(i, { icon: k })}><I size={16} /></button>
                        ))}
                      </div>
                      <div className="agc-colors" role="radiogroup" aria-label="Couleur">
                        {JOB_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={t.color === c} aria-label={`Couleur ${c}`} className={t.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setType(i, { color: c })} />)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => set({ types: [...p.types, { key: `t${Date.now().toString(36)}`, label: 'Nouveau type', icon: 'circle', color: JOB_COLORS[p.types.length % JOB_COLORS.length] }] })}><Plus size={14} /> Ajouter un type</button>
        </section>

        <section className="agc-grid">
          <label className="field">Début de la journée
            <select value={p.startHour} onChange={(e) => set({ startHour: Number(e.target.value) })}>
              {Array.from({ length: 13 }, (_, h) => h).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </label>
          <label className="field">Fin de la journée
            <select value={p.endHour} onChange={(e) => set({ endHour: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => i + 13).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </label>
        </section>

        <section>
          <h3>Espacement des heures</h3>
          <div className="fix-chips">
            {DENSITY.map((d) => <button key={d.key} className={p.density === d.key ? 'on' : ''} onClick={() => set({ density: d.key })}>{d.label}</button>)}
          </div>
        </section>

        <section>
          <h3>Vue à l’ouverture</h3>
          <div className="fix-chips">
            {VIEWS.map((v) => <button key={v.key || 'auto'} className={p.defaultView === v.key ? 'on' : ''} onClick={() => { set({ defaultView: v.key }); try { localStorage.removeItem('murco.agendaView'); } catch { /* ignore */ } }}>{v.label}</button>)}
          </div>
        </section>

        <section className="agc-toggles">
          <label className="check"><input type="checkbox" checked={p.weekends} onChange={(e) => set({ weekends: e.target.checked })} /> Afficher la fin de semaine</label>
          <label className="check"><input type="checkbox" checked={p.showMoney} onChange={(e) => set({ showMoney: e.target.checked })} /> Afficher les montants</label>
          <label className="check"><input type="checkbox" checked={p.showWeather} onChange={(e) => set({ showWeather: e.target.checked })} /> Afficher la météo</label>
        </section>

        <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <button className="btn small" onClick={() => set(DEFAULT_AGENDA)}><RotateCcw size={14} /> Réinitialiser</button>
          <button className="btn accent" onClick={onClose}>Terminé</button>
        </div>
      </div>
    </Modal>
  );
}
