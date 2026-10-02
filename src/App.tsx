import { useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { useSettings } from './lib/hooks';
import Dashboard from './pages/Dashboard';
import DocList from './pages/DocList';
import DocEditor from './pages/DocEditor';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Logbook from './pages/Logbook';
import Expenses from './pages/Expenses';
import ExpenseEditor from './pages/ExpenseEditor';
import GmailPage from './pages/GmailPage';
import Accountant from './pages/Accountant';
import SettingsPage from './pages/SettingsPage';
import Services from './pages/Services';
import { SyncBadge } from './components/SyncBadge';

const NAV = [
  { to: '/', label: 'Tableau de bord', short: 'Accueil', ico: '🏠', end: true },
  { to: '/factures', label: 'Factures', short: 'Factures', ico: '🧾' },
  { to: '/soumissions', label: 'Soumissions', short: 'Soumiss.', ico: '📝' },
  { to: '/codes', label: 'Codes et prix', short: 'Codes', ico: '🏷️' },
  { to: '/clients', label: 'Clients', short: 'Clients', ico: '👥' },
  { to: '/km', label: 'Journal de bord (km)', short: 'Km', ico: '🚗' },
  { to: '/depenses', label: 'Reçus et dépenses', short: 'Reçus', ico: '📷' },
  { to: '/gmail', label: 'Gmail', short: 'Gmail', ico: '✉️' },
  { to: '/comptable', label: 'Dossier comptable', short: 'Comptable', ico: '📦' },
  { to: '/parametres', label: 'Paramètres', short: 'Paramètres', ico: '⚙️' },
];

const MOBILE_MAIN = ['/', '/factures', '/depenses', '/km'];

export default function App() {
  const s = useSettings();
  const [more, setMore] = useState(false);
  const loc = useLocation();

  return (
    <ToastProvider>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <img src={s.logo || './icon.svg'} alt="" />
            <div>
              {s.companyName}
              <small>Gestion d’entreprise</small>
            </div>
          </div>
          <SyncBadge />
          <nav className="nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <span className="ico">{n.ico}</span>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="main" onClick={() => more && setMore(false)}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/factures" element={<DocList type="invoice" />} />
            <Route path="/soumissions" element={<DocList type="quote" />} />
            <Route path="/doc/:id" element={<DocEditor />} />
            <Route path="/codes" element={<Services />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/km" element={<Logbook />} />
            <Route path="/depenses" element={<Expenses />} />
            <Route path="/depenses/:id" element={<ExpenseEditor />} />
            <Route path="/gmail" element={<GmailPage />} />
            <Route path="/comptable" element={<Accountant />} />
            <Route path="/parametres" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
        <nav className="bottomnav">
          {NAV.filter((n) => MOBILE_MAIN.includes(n.to)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMore(false)}>
              <span className="ico">{n.ico}</span>
              {n.short}
            </NavLink>
          ))}
          <button onClick={() => setMore((m) => !m)} aria-expanded={more}>
            <span className="ico">☰</span>Plus
          </button>
        </nav>
        {more && (
          <div className="more-menu hide-desktop">
            {NAV.filter((n) => !MOBILE_MAIN.includes(n.to)).map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className={loc.pathname.startsWith(n.to) ? 'active' : ''}>
                <span>{n.ico}</span>
                {n.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </ToastProvider>
  );
}
