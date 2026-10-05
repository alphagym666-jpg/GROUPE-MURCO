import type { ReactNode } from 'react';

/** Bandeau de haut de page aux couleurs de l'entreprise (même style que l'agenda). */
export function PageHero({ eyebrow, title, sub, actions, children, background }: {
  eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; background?: string;
}) {
  return (
    <section className="ag-hero" style={background ? { background } : undefined}>
      <div className="agh-top">
        <div className="agh-title">
          {eyebrow && <div className="agh-eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {sub && <div className="agh-sub">{sub}</div>}
        </div>
        {actions && <div className="agh-nav">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Anneau de progression (0 à 1). */
export function Ring({ value, big = false, children, onClick, label }: { value: number; big?: boolean; children: ReactNode; onClick?: () => void; label: string }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  const inner = (
    <>
      <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r={r} className="bg" /><circle cx="32" cy="32" r={r} className="fg" style={{ strokeDasharray: `${Math.min(1, Math.max(0, value)) * c} ${c}` }} /></svg>
      <span>{children}</span>
    </>
  );
  return onClick
    ? <button type="button" className={`agh-ring ${big ? 'big' : ''}`} onClick={onClick} aria-label={label}>{inner}</button>
    : <div className={`agh-ring ${big ? 'big' : ''}`} aria-label={label}>{inner}</div>;
}
