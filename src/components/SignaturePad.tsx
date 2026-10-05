import { useEffect, useRef, useState } from 'react';

/** Zone de signature au doigt ou à la souris. */
export function SignaturePad({ onChange, lang = 'fr' }: { onChange: (dataUrl: string | null) => void; lang?: 'fr' | 'en' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

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

  return (
    <div>
      <canvas
        ref={ref}
        className="sig-pad"
        style={{ background: '#fbfaf7' }}
        aria-label="Zone de signature"
        onPointerDown={(e) => {
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
        <span className="small muted">{lang === 'en' ? 'Sign in the box with your finger or mouse.' : 'Signe dans le cadre avec ton doigt ou ta souris.'}</span>
        <span className="spacer" />
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            const c = ref.current!;
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange(null);
          }}
        >
          {lang === 'en' ? 'Clear' : 'Effacer'}
        </button>
      </div>
    </div>
  );
}
