import { isNative } from './native';

// Petites vibrations au toucher (app installée; Android dans le navigateur) pour que l'app « réponde » sous le doigt.
type Kind = 'light' | 'medium' | 'success' | 'error';

export function haptic(kind: Kind = 'light') {
  try {
    if (isNative()) {
      void import('@capacitor/haptics').then(({ Haptics, ImpactStyle, NotificationType }) => {
        if (kind === 'success') return Haptics.notification({ type: NotificationType.Success });
        if (kind === 'error') return Haptics.notification({ type: NotificationType.Error });
        return Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
      }).catch(() => undefined);
    } else if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) {
      navigator.vibrate(kind === 'error' ? [20, 40, 20] : kind === 'success' ? 18 : 8);
    }
  } catch {
    /* pas de vibration */
  }
}

/** Petite pluie de confettis (facture payée, objectif atteint). Rien si l'appareil demande moins d'animations. */
export function celebrate() {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.createElement('div');
    root.className = 'confetti';
    root.setAttribute('aria-hidden', 'true');
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim() || '#e0901f';
    const colors = [accent, '#22c55e', '#3b82f6', '#ec4899', '#facc15', '#a855f7'];
    for (let i = 0; i < 48; i++) {
      const p = document.createElement('i');
      const angle = (Math.random() - 0.5) * Math.PI * 0.9;
      const dist = 140 + Math.random() * 260;
      p.style.setProperty('--x', `${Math.sin(angle) * dist}px`);
      p.style.setProperty('--y', `${-Math.cos(angle) * dist - 60}px`);
      p.style.setProperty('--r', `${(Math.random() - 0.5) * 720}deg`);
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = `${Math.random() * 90}ms`;
      if (i % 3 === 0) p.style.borderRadius = '50%';
      root.appendChild(p);
    }
    document.body.appendChild(root);
    haptic('success');
    setTimeout(() => root.remove(), 1700);
  } catch {
    /* ignore */
  }
}
