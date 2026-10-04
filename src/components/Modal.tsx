import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Rendue à la racine de la page: jamais coincée dans une barre ou une liste qui défile.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div className="spacer" />
          <button className="btn small" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
