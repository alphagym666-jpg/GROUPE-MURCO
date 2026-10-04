import { useRef, useState, type ReactNode } from 'react';
import { haptic } from '../lib/feel';

export interface SwipeAction {
  label: string;
  icon: ReactNode;
  tone: 'green' | 'amber' | 'blue' | 'red';
  run: () => void;
}

const THRESHOLD = 84;

/**
 * Ligne qui se glisse avec le doigt (cellulaire):
 * vers la droite → action de gauche (ex.: « Payée »), vers la gauche → action de droite (ex.: « Relancer »).
 */
export function SwipeRow({ left, right, onTap, children }: { left?: SwipeAction; right?: SwipeAction; onTap?: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const start = useRef<{ x: number; y: number; locked?: 'h' | 'v' } | null>(null);
  const passed = useRef(false);

  const end = () => {
    const s = start.current;
    start.current = null;
    setAnim(true);
    if (s?.locked === 'h') {
      if (dx > THRESHOLD && left) left.run();
      else if (dx < -THRESHOLD && right) right.run();
    }
    setDx(0);
    passed.current = false;
  };

  const act = dx > 0 ? left : dx < 0 ? right : undefined;
  return (
    <div className="swipe">
      {left && <div className={`swipe-bg left ${left.tone} ${dx > THRESHOLD ? 'ready' : ''}`} style={{ opacity: dx > 0 ? 1 : 0 }}>{left.icon} {left.label}</div>}
      {right && <div className={`swipe-bg right ${right.tone} ${dx < -THRESHOLD ? 'ready' : ''}`} style={{ opacity: dx < 0 ? 1 : 0 }}>{right.label} {right.icon}</div>}
      <div
        className="swipe-fg"
        style={{ transform: `translateX(${dx}px)`, transition: anim ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none' }}
        onTouchStart={(e) => {
          setAnim(false);
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchMove={(e) => {
          const s = start.current;
          if (!s) return;
          const mx = e.touches[0].clientX - s.x;
          const my = e.touches[0].clientY - s.y;
          if (!s.locked && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.locked = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
          if (s.locked !== 'h') return;
          const v = (mx > 0 && !left) || (mx < 0 && !right) ? mx * 0.15 : mx;
          const clamped = Math.max(-160, Math.min(160, v));
          if (Math.abs(clamped) > THRESHOLD !== passed.current) {
            passed.current = Math.abs(clamped) > THRESHOLD;
            if (passed.current) haptic('light');
          }
          setDx(clamped);
        }}
        onTouchEnd={end}
        onTouchCancel={end}
        onClick={() => {
          if (Math.abs(dx) < 4) onTap?.();
        }}
        aria-label={act ? act.label : undefined}
      >
        {children}
      </div>
    </div>
  );
}
