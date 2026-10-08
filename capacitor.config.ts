import type { CapacitorConfig } from '@capacitor/cli';

// App mobile (Android / iPhone): la même app web, emballée en app native.
const config: CapacitorConfig = {
  appId: 'com.groupemurco.gestion',
  appName: 'Murco',
  webDir: 'dist',
  // L'app charge toujours la dernière version du site: plus besoin de réinstaller l'APK à chaque changement.
  server: { url: 'https://alphagym666-jpg.github.io/GROUPE-MURCO/', androidScheme: 'https' },
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
};

export default config;
