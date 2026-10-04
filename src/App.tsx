import {
  CalendarDays, Camera, ChevronLeft, Download, FolderOpen, TrendingUp, Inbox, Clock, Briefcase, UsersRound, Car, ClipboardList, FileText, Home, LayoutGrid, Mail, Moon, Package, Plus, Search, Settings, Sun, SunMoon, Tag, Timer, Users, X, Zap, ImagePlus, type LucideIcon,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
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
import { db } from './lib/db';
import { APK_URL, useAppUpdate } from './lib/update';
import { isNative } from './lib/native';

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

// Barre du bas sur cellulaire: '+' = bouton Créer au centre, 'menu' = toutes les sections
const MOBILE_TABS: Record<Role, string[]> = {
  owner: ['/', '/agenda', '+', '/factures', 'menu'],
  admin: ['/', '/agenda', '+', '/factures', 'menu'],
  vendeur: ['/demandes', '/agenda', '+', '/soumissions', 'menu'],
  employe: ['/agenda', '/pointage', '+', 'menu'],
};

const EXTRA: NavItem[] = [{ to: '/temps', label: 'Feuilles de temps', short: 'Heures', icon: Timer }];

const MENU_GROUPS: { title: string; items: string[] }[] = [
  { title: 'Ventes', items: ['/demandes', '/soumissions', '/factures', '/clients', '/projets'] },
  { title: 'Terrain', items: ['/agenda', '/pointage', '/equipe', '/temps'] },
  { title: 'Argent et papiers', items: ['/depenses', '/km', '/classeur', '/rapports', '/comptable'] },
  { title: 'Outils', items: ['/', '/codes', '/gmail', '/parametres'] },
];

const PAGE_TITLE: [RegExp, string][] = [
  [/^\/doc\//, 'Facture / soumission'], [/^\/job\//, 'Job'], [/^\/depenses\/.+/, 'Reçu'], [/^\/clients\/.+/, 'Client'],
  [/^\/projets\/.+/, 'Projet'], [/^\/express/, 'Facture express'], [/^\/temps/, 'Feuilles de temps'],
];
/** Où mène « Retour » quand on arrive directement sur une page (lien, notification). */
const PARENT: [RegExp, string][] = [
  [/^\/doc\//, '/factures'], [/^\/job\//, '/agenda'], [/^\/depenses\/.+/, '/depenses'], [/^\/clients\/.+/, '/clients'],
  [/^\/projets\/.+/, '/projets'], [/^\/temps/, '/equipe'],
];

/** Routes d'édition: sur cellulaire, la barre du bas laisse place aux boutons de la page. */
const isEditorRoute = (p: string) => /^\/(doc|job)\//.test(p) || /^\/depenses\/.+/.test(p);

const QUICK: { label: string; icon: LucideIcon; to: string; roles?: Role[] }[] = [
  { label: 'Facture express', icon: Zap, to: '/express' },
  { label: 'Punch in / out', icon: Clock, to: '/pointage', roles: ['employe', 'vendeur'] },
  { label: 'Planifier un job', icon: CalendarDays, to: '/job/new' },
  { label: 'Photo de reçu', icon: Camera, to: '/depenses/new' },
  { label: 'Photo de job', icon: ImagePlus, to: '/job/new?photo=1', roles: ['employe', 'vendeur'] },
  { label: 'Soumission', icon: ClipboardList, to: '/doc/new?type=quote', roles: ['vendeur'] },
  { label: 'Nouvelle demande', icon: Inbox, to: '/demandes?new=1', roles: ['vendeur'] },
  { label: 'Facture complète', icon: FileText, to: '/doc/new?type=invoice' },
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
  const update = useAppUpdate();
  const newLeads = useLiveQuery(() => db.leads.where('stage').equals('nouveau').count(), []) ?? 0;
  const editor = isEditorRoute(loc.pathname);
  const findNav = (to: string) => NAV.find((n) => n.to === to) ?? EXTRA.find((n) => n.to === to);
  const leadsVisible = canSee(NAV[1], role);
  const path = loc.pathname;
  const tabs = MOBILE_TABS[role];
  const isRoot = tabs.includes(path) || (path === '/' && full) || (!full && path === tabs[0]);
  const pageTitle = PAGE_TITLE.find(([r]) => r.test(path))?.[1] ?? NAV.find((n) => n.to !== '/' && (path === n.to || path.startsWith(n.to + '/')))?.label ?? '';
  const goBack = () => {
    if (loc.key !== 'default' && window.history.length > 1) nav(-1);
    else nav(PARENT.find(([r]) => r.test(path))?.[1] ?? tabs[0].replace('+', '/'));
  };

  // Bouton « retour » du téléphone (Android): ferme d'abord ce qui est ouvert, puis revient en arrière
  const backRef = useRef<() => void>(() => undefined);
  backRef.current = () => {
    const modalClose = document.querySelector<HTMLButtonElement>('.modal-bg .modal [aria-label="Fermer"]');
    if (fab || more || cmd) {
      setFab(false);
      setMore(false);
      setCmd(false);
    } else if (modalClose) modalClose.click();
    else if (!isRoot) goBack();
    else void import('@capacitor/app').then(({ App: CapApp }) => CapApp.minimizeApp());
  };
  useEffect(() => {
    if (!isNative()) return;
    let off: (() => void) | undefined;
    void import('@capacitor/app').then(({ App: CapApp }) =>
      CapApp.addListener('backButton', () => backRef.current()).then((h) => (off = () => void h.remove())),
    );
    return () => off?.();
  }, []);

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

        <main className={`main ${editor ? 'is-editor' : ''}`}>
          <header className="topbar">
            {isRoot ? (
              <div className="tb-title"><img src={s.logo || './icon.svg'} alt="" /><span>{s.companyName}</span></div>
            ) : (
              <>
                <button className="tb-btn tb-back" onClick={goBack} aria-label="Retour"><ChevronLeft size={26} /> Retour</button>
                <div className="tb-title"><span>{pageTitle}</span></div>
              </>
            )}
            <button className="tb-btn" onClick={() => setCmd(true)} aria-label="Rechercher"><Search size={21} /></button>
            <NavLink className="tb-btn" to="/parametres" aria-label={`Synchronisation: ${st.status}`}>
              <span className={`tb-dot ${st.status === 'ok' ? 'ok' : st.status === 'error' ? 'err' : ''}`} />
            </NavLink>
          </header>
          <div className="page-anim" key={'/' + path.split('/')[1]}>
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
          </div>
        </main>

        {update.available && (
          <div className="update-bar">
            <Download size={18} />
            <span>Nouvelle version de l’app disponible</span>
            <a className="btn small accent" href={APK_URL} target="_blank" rel="noreferrer" onClick={update.dismiss}>Mettre à jour</a>
            <button className="icon-btn" aria-label="Plus tard" onClick={update.dismiss}><X size={16} /></button>
          </div>
        )}

        {!editor && (
          <nav className={`bottomnav cols-${MOBILE_TABS[role].length}`}>
            {MOBILE_TABS[role].map((to) => {
              if (to === '+') {
                return (
                  <button key="+" className={`tab-create ${fab ? 'open' : ''}`} aria-label="Ajouter" aria-expanded={fab} onClick={() => { setFab((x) => !x); setMore(false); }}>
                    <span><Plus size={26} /></span>
                  </button>
                );
              }
              if (to === 'menu') {
                return (
                  <button key="menu" className={more ? 'active' : ''} aria-expanded={more} onClick={() => { setMore((m) => !m); setFab(false); }}>
                    <span className="tab-ico"><LayoutGrid size={22} />{leadsVisible && newLeads > 0 && !MOBILE_TABS[role].includes('/demandes') && <i className="tab-badge">{newLeads}</i>}</span>
                    Menu
                  </button>
                );
              }
              const n = findNav(to)!;
              return (
                <NavLink key={n.to} to={n.to} end={n.end}>
                  <span className="tab-ico"><n.icon size={22} />{n.to === '/demandes' && newLeads > 0 && <i className="tab-badge">{newLeads}</i>}</span>
                  {n.short}
                </NavLink>
              );
            })}
          </nav>
        )}

        {fab && (
          <div className="sheet-wrap hide-desktop" onClick={() => setFab(false)}>
            <div className="sheet" role="dialog" aria-label="Créer" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" />
              <div className="sheet-title">Créer</div>
              <div className="create-grid">
                {QUICK.filter((q) => canSee(q, role)).map((q) => (
                  <button key={q.to} onClick={() => nav(q.to)}>
                    <span className="ci"><q.icon size={22} /></span>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {more && (
          <div className="sheet-wrap hide-desktop" onClick={() => setMore(false)}>
            <div className="sheet tall" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" />
              <div className="sheet-head">
                <img src={s.logo || './icon.svg'} alt="" />
                <div><strong>{s.companyName}</strong><SyncBadge /></div>
                <button className="icon-btn" aria-label="Fermer" onClick={() => setMore(false)}><X size={20} /></button>
              </div>
              <button className="sheet-search" onClick={() => { setMore(false); setCmd(true); }}><Search size={18} /> Rechercher un client, une facture…</button>
              {MENU_GROUPS.map((g) => {
                const items = g.items.map(findNav).filter((n): n is NavItem => !!n && canSee(n, role));
                if (!items.length) return null;
                return (
                  <div key={g.title} className="menu-group">
                    <div className="menu-group-title">{g.title}</div>
                    <div className="menu-tiles">
                      {items.map((n) => (
                        <NavLink key={n.to} to={n.to} end={n.end}>
                          <span className="mi"><n.icon size={22} />{n.to === '/demandes' && newLeads > 0 && <i className="tab-badge">{newLeads}</i>}</span>
                          {n.short}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                );
              })}
              <button className="sheet-row" onClick={() => setThemeState(cycleTheme())}><ThemeIcon size={18} /> {THEME_LABEL[theme]}</button>
            </div>
          </div>
        )}
        {cmd && <CommandPalette onClose={() => setCmd(false)} />}
      </div>
    </ToastProvider>
  );
}
