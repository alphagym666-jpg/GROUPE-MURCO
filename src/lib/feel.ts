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

/** Confirmation discrète (facture payée): un crochet qui se dessine, puis disparaît. */
export function celebrate() {
  haptic('success');
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.createElement('div');
    root.className = 'done-pop';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>';
    document.body.appendChild(root);
    setTimeout(() => root.remove(), 1300);
  } catch {
    /* ignore */
  }
}
