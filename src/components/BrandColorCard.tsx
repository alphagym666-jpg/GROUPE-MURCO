import { Palette, Pipette, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { ACCENT_SWATCHES, colorFromLogo, DEFAULT_ACCENT } from '../lib/accent';
import { useToast } from './Toast';

/** Couleur de l'entreprise: boutons, bandeaux, factures PDF et page des clients. */
export function BrandColorCard({ value, logo, company, onChange }: { value?: string; logo?: string; company: string; onChange: (c: string) => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const cur = (value || DEFAULT_ACCENT).toLowerCase();

  const fromLogo = async () => {
    if (!logo) return;
    setBusy(true);
    try {
      const c = await colorFromLogo(logo);
      if (c) {
        onChange(c);
        notify('Couleur prise de ton logo');
      } else notify('Ton logo est surtout noir, blanc ou gris : choisis une couleur ci-dessous.', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" id="couleur">
      <h2><Palette size={18} style={{ verticalAlign: '-3px' }} /> Couleur de l’entreprise</h2>
      <p className="small muted" style={{ marginTop: -4 }}>Utilisée pour les boutons et les bandeaux de l’app, tes factures PDF et la page que voient tes clients.</p>
      <div className="brand-row">
        <div className="swatches" role="radiogroup" aria-label="Couleur de l’entreprise">
          {ACCENT_SWATCHES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cur === c} aria-label={`Couleur ${c}`} className={cur === c ? 'on' : ''} style={{ background: c }} onClick={() => onChange(c)} />
          ))}
          <label className={`sw-custom ${ACCENT_SWATCHES.includes(cur) ? '' : 'on'}`} title="Autre couleur">
            <Pipette size={15} />
            <input type="color" value={cur} aria-label="Autre couleur" onChange={(e) => onChange(e.target.value)} />
          </label>
        </div>
        {logo && <button className="btn small" disabled={busy} onClick={() => void fromLogo()}><Sparkles size={14} /> Prendre la couleur du logo</button>}
      </div>
      <div className="brand-preview" aria-hidden>
        <div className="bp-hero"><span>Tableau de bord</span><b>{company || 'Ton entreprise'}</b></div>
        <div className="bp-doc">
          <div className="bp-line" />
          <div className="bp-rows"><i /><i /><i /></div>
          <div className="bp-total">TOTAL</div>
        </div>
        <button className="btn accent small" tabIndex={-1}>Bouton</button>
      </div>
    </div>
  );
}
