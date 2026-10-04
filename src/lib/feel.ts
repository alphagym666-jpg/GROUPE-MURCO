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
