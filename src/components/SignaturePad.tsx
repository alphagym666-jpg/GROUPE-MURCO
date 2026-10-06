import { useEffect, useRef, useState } from 'react';

/** Zone de signature: dessinée au doigt ou à la souris, ou saisie (le nom en écriture cursive). */
export function SignaturePad({ onChange, lang = 'fr', typedName = '' }: { onChange: (dataUrl: string | null) => void; lang?: 'fr' | 'en'; typedName?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const en = lang === 'en';

  // « Saisir »: le nom complet écrit en cursive dans le cadre
  useEffect(() => {
    if (mode !== 'type') return;
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const w = c.offsetWidth;
    const h = c.offsetHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    const name = typedName.trim();
    if (!name) {
      setEmpty(true);
      onChange(null);
      return;
    }
    let size = 44;
    const font = (n: number) => `italic ${n}px "Segoe Script", "Brush Script MT", "Snell Roundhand", "Dancing Script", cursive`;
    ctx.font = font(size);
    while (ctx.measureText(name).width > w - 32 && size > 18) ctx.font = font((size -= 2));
    ctx.fillStyle = '#1d1f22';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 16, h / 2);
    setEmpty(false);
    onChange(c.toDataURL('image/png'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typedName]);

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1d1f22';
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const clear = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="seg sig-mode" role="tablist">
        <button type="button" className={mode === 'draw' ? 'on' : ''} onClick={() => { setMode('draw'); clear(); }}>{en ? 'Draw' : 'Dessiner'}</button>
        <button type="button" className={mode === 'type' ? 'on' : ''} onClick={() => setMode('type')}>{en ? 'Type' : 'Saisir'}</button>
      </div>
      <canvas
        ref={ref}
        className="sig-pad"
        style={{ background: '#fbfaf7' }}
        aria-label="Zone de signature"
        onPointerDown={(e) => {
          if (mode === 'type') return;
          drawing.current = true;
          ref.current!.setPointerCapture(e.pointerId);
          const ctx = ref.current!.getContext('2d')!;
          const [x, y] = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext('2d')!;
          const [x, y] = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          if (empty) setEmpty(false);
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (!empty) onChange(ref.current!.toDataURL('image/png'));
        }}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <span className="small muted">{mode === 'type' ? (en ? (typedName.trim() ? 'Your typed name is your signature.' : 'Enter your full name above.') : (typedName.trim() ? 'Ton nom saisi sert de signature.' : 'Entre ton nom complet plus haut.')) : en ? 'Sign in the box with your finger or mouse.' : 'Signe dans le cadre avec ton doigt ou ta souris.'}</span>
        <span className="spacer" />
        {mode === 'draw' && <button
          type="button"
          className="btn small ghost"
          onClick={clear}
        >
          {en ? 'Clear' : 'Effacer'}
        </button>}
      </div>
    </div>
  );
}
