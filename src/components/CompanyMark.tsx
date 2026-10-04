import type { Settings } from '../lib/db';

/** Logo de l'entreprise, ou sa première lettre si aucun logo n'est ajouté. */
export function CompanyMark({ s, size = 30 }: { s: Settings; size?: number }) {
  const src = s.logo || (s.companyName === 'Groupe Murco' ? './icon.svg' : '');
  if (src) return <img src={src} alt="" style={{ width: size, height: size }} />;
  return (
    <span className="co-mark" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
      {(s.companyName || '?').trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
