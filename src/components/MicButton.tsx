import { Mic, Square } from 'lucide-react';

/** Gros bouton de dictée: « Commencer » puis « Arrêter » — la dictée continue tant qu'on n'arrête pas. */
export function MicButton({ listening, onClick, small = false, startLabel = 'Commencer à parler' }: { listening: boolean; onClick: () => void; small?: boolean; startLabel?: string }) {
  return (
    <div className={`mic-ctl ${small ? 'small' : ''}`}>
      <button type="button" className={`vj-btn ${small ? 'small' : ''} ${listening ? 'on' : ''}`} onClick={onClick} aria-label={listening ? 'Arrêter la dictée' : startLabel}>
        {listening ? <Square size={small ? 22 : 28} fill="currentColor" /> : <Mic size={small ? 26 : 34} />}
      </button>
      <button type="button" className={`mic-label ${listening ? 'on' : ''}`} onClick={onClick}>
        {listening ? <><span className="rec-dot" /> Arrêter — j’ai fini</> : startLabel}
      </button>
    </div>
  );
}
