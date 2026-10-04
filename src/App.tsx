import {
  CalendarDays, Camera, FolderOpen, TrendingUp, Inbox, Clock, Briefcase, UsersRound, Car, ClipboardList, FileText, Home, Mail, Menu, Moon, Package, Plus, Search, Settings, Sun, SunMoon, Tag, Users, Zap, ImagePlus, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
import Leads from './pages/Leads';
import LeadForm from './pages/LeadForm';
import Join from './pages/Join';
import PunchPage from './pages/Punch';
import Timesheets from './pages/Timesheets';
import Team from './pages/Team';
import Projects, { ProjectDetail } from './pages/Projects';
import { useSyncState, type Role } from './lib/sync';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  end?: boolean;
  sep?: boolean;
  roles?: Role[]; // rôles qui voient l'élément (tous si absent → propriétaire/admin seulement)
}

const NAV: NavItem[] = [
  { to: '/', label: 'Tableau de bord', short: 'Accueil', icon: Home, end: true },
  { to: '/demandes', label: 'Demandes', short: 'Demandes', icon: Inbox, roles: ['vendeur'] },
  { to: '/agenda', label: 'Agenda', short: 'Agenda', icon: CalendarDays, roles: ['employe', 'vendeur'] },
  { to: '/pointage', label: 'Pointage', short: 'Pointage', icon: Clock, roles: ['employe', 'vendeur'] },
  { to: '/factures', label: 'Factures', short: 'Factures', icon: FileText },
  { to: '/soumissions', label: 'Soumissions', short: 'Soumissions', icon: ClipboardList, roles: ['vendeur'] },
  { to: '/clients', label: 'Clients', short: 'Clients', icon: Users, roles: ['vendeur'] },
  { to: '/projets', label: 'Projets', short: 'Projets', icon: Briefcase },
  { to: '/equipe', label: 'Équipe', short: 'Équipe', icon: UsersRound },
  { to: '/rapports', label: 'Rapports', short: 'Rapports', icon: TrendingUp },
  { to: '/codes', label: 'Codes et prix', short: 'Codes', icon: Tag, sep: true },
  { to: '/km', label: 'Journal de bord', short: 'Km', icon: Car },
  { to: '/depenses', label: 'Reçus et dépenses', short: 'Reçus', icon: Camera },
  { to: '/classeur', label: 'Classeur', short: 'Classeur', icon: FolderOpen },
  { to: '/gmail', label: 'Gmail', short: 'Gmail', icon: Mail },
  { to: '/comptable', label: 'Dossier comptable', short: 'Comptable', icon: Package },
  { to: '/parametres', label: 'Paramètres', short: 'Paramètres', icon: Settings, roles: ['employe', 'vendeur'] },
];

const canSee = (n: { roles?: Role[] }, role: Role) => role === 'owner' || role === 'admin' || !!n.roles?.includes(role);

const MOBILE_MAIN: Record<Role, string[]> = {
  owner: ['/', '/agenda', '/demandes', '/factures'],
  admin: ['/', '/agenda', '/demandes', '/factures'],
  vendeur: ['/demandes', '/agenda', '/soumissions', '/pointage'],
  employe: ['/agenda', '/pointage', '/parametres'],
};

const QUICK: { label: string; icon: LucideIcon; to: string; roles?: Role[] }[] = [
  { label: 'Punch in / out', icon: Clock, to: '/pointage', roles: ['employe', 'vendeur'] },
  { label: 'Photo de job', icon: ImagePlus, to: '/job/new?photo=1', roles: ['employe', 'vendeur'] },
  { label: 'Nouvelle demande', icon: Inbox, to: '/demandes?new=1', roles: ['vendeur'] },
  { label: 'Facture express', icon: Zap, to: '/express' },
  { label: 'Planifier un job', icon: CalendarDays, to: '/job/new' },
  { label: 'Photo de reçu', icon: Camera, to: '/depenses/new' },
  { label: 'Soumission', icon: ClipboardList, to: '/doc/new?type=quote', roles: ['vendeur'] },
];

const THEME_LABEL: Record<ThemePref, string> = { system: 'Thème: auto', dark: 'Thème: sombre', light: 'Thème: clair' };
const THEME_ICON: Record<ThemePref, LucideIcon> = { system: SunMoon, dark: Moon, light: Sun };

export default function App() {
  const loc = useLocation();
  // Pages publiques (client, formulaire, invitation): sans le menu de l'app
  if (loc.pathname.startsWith('/p/') || loc.pathname.startsWith('/demande/') || loc.pathname.startsWith('/rejoindre')) {
    return (
      <ToastProvider>
        <Routes>
          <Route path="/p/:token" element={<Portal />} />
          <Route path="/demande/:owner" element={<LeadForm />} />
          <Route path="/rejoindre" element={<Join />} />
        </Routes>
      </ToastProvider>
    );
  }
  return <Shell />;
}

function Shell() {
  const s = useSettings();
  const st = useSyncState();
  const role = st.role;
  const full = role === 'owner' || role === 'admin';
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
          {full && (
            <button className="btn accent" style={{ margin: '0 4px 12px' }} onClick={() => nav('/express')}>
              <Zap size={17} /> Facture express
            </button>
          )}
          <nav className="nav">
            {NAV.filter((n) => canSee(n, role)).map((n) => (
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
            <Route path="/" element={full ? <Dashboard onSearch={() => setCmd(true)} /> : <Navigate to={role === 'vendeur' ? '/demandes' : '/pointage'} replace />} />
            <Route path="/demandes" element={<Leads />} />
            <Route path="/pointage" element={<PunchPage />} />
            <Route path="/temps" element={<Timesheets />} />
            <Route path="/equipe" element={<Team />} />
            <Route path="/projets" element={<Projects />} />
            <Route path="/projets/:id" element={<ProjectDetail />} />
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
            <Route path="*" element={full ? <Dashboard onSearch={() => setCmd(true)} /> : <Navigate to="/agenda" replace />} />
          </Routes>
        </main>

        {!loc.pathname.startsWith('/express') && (
          <button className={`fab ${fab ? 'open' : ''}`} aria-label="Créer" aria-expanded={fab} onClick={() => { setFab((x) => !x); setMore(false); }}>
            <Plus size={28} />
          </button>
        )}
        {fab && (
          <div className="fab-menu hide-desktop">
            {QUICK.filter((q) => canSee(q, role)).map((q) => (
              <button key={q.to} onClick={() => nav(q.to)}>
                <q.icon size={18} /> {q.label}
              </button>
            ))}
          </div>
        )}

        <nav className="bottomnav">
          {MOBILE_MAIN[role].map((to) => NAV.find((n) => n.to === to)!).map((n) => (
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
            {NAV.filter((n) => canSee(n, role) && !MOBILE_MAIN[role].includes(n.to)).map((n) => (
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
