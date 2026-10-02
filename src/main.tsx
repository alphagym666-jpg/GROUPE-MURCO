import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/figtree';
import './styles.css';
import { applyTheme } from './lib/theme';
import { seedServices } from './lib/db';
import { startSync } from './lib/sync';
import './lib/portal';

applyTheme();
seedServices().catch(() => undefined);
startSync();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);

// Mode hors-ligne / installation comme application mobile
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
