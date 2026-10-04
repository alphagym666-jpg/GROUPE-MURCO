import {
  CalendarDays, Camera, FolderOpen, TrendingUp, Car, ClipboardList, FileText, Home, Mail, Menu, Moon, Package, Plus, Search, Settings, Sun, SunMoon, Tag, Users, Zap, ImagePlus, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CommandPalette } from './components/CommandPalette';
import { SyncBadge } from './components/SyncBadge';
import { ToastProvider } from './components/Toast';
import { useSettings } from './lib/hooks';
import { cycleTheme, getTheme, type ThemePref } from './lib/theme';
import Accountant from './pages/Accountant';
import Agenda from './pages/Agenda';
import ClientDetail from './pages/ClientDetail';
import Clients from './pages/Clients';
import Dashboard from './pages/Dashboard';
import DocEditor from './pages/DocEditor';
import DocList from './pages/DocList';
import ExpenseEditor from './pages/ExpenseEditor';
import Expenses from './pages/Expenses';
import Express from './pages/Express';
import GmailPage from './pages/GmailPage';
import JobEditor from './pages/JobEditor';
import Logbook from './pages/Logbook';
import Library from './pages/Library';
import Reports from './pages/Reports';
import Portal from './pages/Portal';
import Services from './pages/Services';
import SettingsPage from './pages/SettingsPage';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  end?: boolean;
  sep?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Tableau de bord', short: 'Accueil', icon: Home, end: true },
  { to: '/agenda', label: 'Agenda', short: 'Agenda', icon: CalendarDays },
  { to: '/factures', label: 'Factures', short: 'Factures', icon: FileText },
  { to: '/soumissions', label: 'Soumissions', short: 'Soumissions', icon: ClipboardList },
  { to: '/clients', label: 'Clients', short: 'Clients', icon: Users },
  { to: '/rapports', label: 'Rapports', short: 'Rapports', icon: TrendingUp },
  { to: '/codes', label: 'Codes et prix', short: 'Codes', icon: Tag, sep: true },
  { to: '/km', label: 'Journal de bord', short: 'Km', icon: Car },
  { to: '/depenses', label: 'Reçus et dépenses', short: 'Reçus', icon: Camera },
  { to: '/classeur', label: 'Classeur', short: 'Classeur', icon: FolderOpen },
  { to: '/gmail', label: 'Gmail', short: 'Gmail', icon: Mail },
  { to: '/comptable', label: 'Dossier comptable', short: 'Comptable', icon: Package },
  { to: '/parametres', label: 'Paramètres', short: 'Paramètres', icon: Settings },
];

const MOBILE_MAIN = ['/', '/agenda', '/factures', '/km'];

const QUICK = [
  { label: 'Facture express', icon: Zap, to: '/express' },
  { label: 'Planifier un job', icon: CalendarDays, to: '/job/new' },
  { label: 'Photo de reçu', icon: Camera, to: '/depenses/new' },
  { label: 'Photo de job', icon: ImagePlus, to: '/job/new?photo=1' },
  { label: 'Soumission', icon: ClipboardList, to: '/doc/new?type=quote' },
];

const THEME_LABEL: Record<ThemePref, string> = { system: 'Thème: auto', dark: 'Thème: sombre', light: 'Thème: clair' };
const THEME_ICON: Record<ThemePref, LucideIcon> = { system: SunMoon, dark: Moon, light: Sun };

export default function App() {
  const loc = useLocation();
  // Portail client: page publique, sans le menu de l'app
  if (loc.pathname.startsWith('/p/')) {
    return (
      <ToastProvider>
        <Routes>
          <Route path="/p/:token" element={<Portal />} />
        </Routes>
      </ToastProvider>
    );
  }
  return <Shell />;
}

function Shell() {
  const s = useSettings();
  const nav = useNavigate();
  const loc = useLocation();
  const [more, setMore] = useState(false);
  const [fab, setFab] = useState(false);
  const [cmd, setCmd] = useState(false);
  const [theme, setThemeState] = useState<ThemePref>(getTheme());
  const ThemeIcon = THEME_ICON[theme];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmd((x) => !x);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setMore(false);
    setFab(false);
  }, [loc.pathname]);

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
          <button className="btn accent" style={{ margin: '0 4px 12px' }} onClick={() => nav('/express')}>
            <Zap size={17} /> Facture express
          </button>
          <nav className="nav">
            {NAV.map((n) => (
              <div key={n.to}>
                {n.sep && <div className="nav-sep" />}
                <NavLink to={n.to} end={n.end}>
                  <span className="ico"><n.icon size={18} /></span>
                  {n.label}
                </NavLink>
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <button className="side-btn" onClick={() => setCmd(true)}>
              <Search size={16} /> Rechercher <kbd>Ctrl K</kbd>
            </button>
            <button className="side-btn" onClick={() => setThemeState(cycleTheme())}>
              <ThemeIcon size={16} /> {THEME_LABEL[theme]}
            </button>
          </div>
        </aside>

        <main className="main" onClick={() => (more || fab) && (setMore(false), setFab(false))}>
          <Routes>
            <Route path="/" element={<Dashboard onSearch={() => setCmd(true)} />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/job/:id" element={<JobEditor />} />
            <Route path="/express" element={<Express />} />
            <Route path="/factures" element={<DocList type="invoice" />} />
            <Route path="/soumissions" element={<DocList type="quote" />} />
            <Route path="/doc/:id" element={<DocEditor />} />
            <Route path="/codes" element={<Services />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/km" element={<Logbook />} />
            <Route path="/depenses" element={<Expenses />} />
            <Route path="/depenses/:id" element={<ExpenseEditor />} />
            <Route path="/classeur" element={<Library />} />
            <Route path="/rapports" element={<Reports />} />
            <Route path="/gmail" element={<GmailPage />} />
            <Route path="/comptable" element={<Accountant />} />
            <Route path="/parametres" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard onSearch={() => setCmd(true)} />} />
          </Routes>
        </main>

        {!loc.pathname.startsWith('/express') && (
          <button className={`fab ${fab ? 'open' : ''}`} aria-label="Créer" aria-expanded={fab} onClick={() => { setFab((x) => !x); setMore(false); }}>
            <Plus size={28} />
          </button>
        )}
        {fab && (
          <div className="fab-menu hide-desktop">
            {QUICK.map((q) => (
              <button key={q.to} onClick={() => nav(q.to)}>
                <q.icon size={18} /> {q.label}
              </button>
            ))}
          </div>
        )}

        <nav className="bottomnav">
          {NAV.filter((n) => MOBILE_MAIN.includes(n.to)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <n.icon size={22} />
              {n.short}
            </NavLink>
          ))}
          <button onClick={() => { setMore((m) => !m); setFab(false); }} aria-expanded={more}>
            <Menu size={22} />
            Plus
          </button>
        </nav>
        {more && (
          <div className="more-menu hide-desktop">
            {NAV.filter((n) => !MOBILE_MAIN.includes(n.to)).map((n) => (
              <NavLink key={n.to} to={n.to} className={loc.pathname.startsWith(n.to) ? 'active' : ''}>
                <n.icon size={18} />
                {n.label}
              </NavLink>
            ))}
            <button onClick={() => { setMore(false); setCmd(true); }}><Search size={18} /> Rechercher</button>
            <button onClick={() => setThemeState(cycleTheme())}><ThemeIcon size={18} /> {THEME_LABEL[theme]}</button>
          </div>
        )}
        {cmd && <CommandPalette onClose={() => setCmd(false)} />}
      </div>
    </ToastProvider>
  );
}
