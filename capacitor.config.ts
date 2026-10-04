import type { CapacitorConfig } from '@capacitor/cli';

// App mobile (Android / iPhone): la même app web, emballée en app native.
const config: CapacitorConfig = {
  appId: 'com.groupemurco.gestion',
  appName: 'Murco',
  webDir: 'dist',
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
};

export default config;
