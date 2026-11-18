/* eslint-disable @typescript-eslint/no-explicit-any */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight,
  BarChart3, BookOpen, Bot, BriefcaseBusiness, Building2, CalendarDays,
  Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, Download, FileText, FolderOpen, Grid2X2,
  Handshake, LayoutDashboard, ListTodo, Mail, Menu, MessageSquare, Moon,
  MoreHorizontal, Package, Paperclip, Pause, Phone, Play, Plus, RefreshCw,
  Search, Send, Settings2, ShieldCheck, ShoppingBag, Sparkles, Sun, Target,
  TrendingUp, Users, Wallet, Workflow, X,
} from "lucide-react";
import { Operations } from "./Operations";
import { Dashboard } from "./Dashboard";
import { AllDayLogo } from "./AllDayLogo";
import { QuickTools } from "./QuickTools";
import { Guide } from "./Guide";
import { Consultation } from "./Consultation";
import { TeamWorkspace } from "./TeamWorkspace";
import type { Action, DemoState, Entity, Navigate, Notify } from "./types";
import { Avatar, Badge, Button, Empty, Field, Modal, Panel, cx, dateLabel, money } from "./shared";

const DemoPdf = lazy(() => import("./DemoPdf"));

type PageProps = { state: DemoState; act: Action; navigate: Navigate; notify: Notify; selectedId?: string };
const stages = [
  { id: "new", name: "Nowy kontakt", color: "blue", icon: Users },
  { id: "contacted", name: "W kontakcie", color: "cyan", icon: MessageSquare },
  { id: "qualified", name: "Zakwalifikowany", color: "violet", icon: CheckCircle2 },
  { id: "proposal", name: "Oferta", color: "amber", icon: FileText },
  { id: "won", name: "Wygrane", color: "green", icon: Handshake },
  { id: "lost", name: "Zamknięte", color: "gray", icon: FolderOpen },
];
const navigation = [
  { label: "NA CO DZIEŃ", items: [
    ["overview", "Pulpit", LayoutDashboard], ["mail", "Poczta", Mail],
    ["calendar", "Kalendarz", CalendarDays],
  ] },
  { label: "FIRMA", items: [
    ["clients", "Klienci", Building2], ["pipeline", "Sprzedaż", Workflow],
    ["offers", "Oferty", FileText], ["orders", "Zamówienia", ShoppingBag],
    ["invoices", "Finanse", Wallet], ["projects", "Projekty", BriefcaseBusiness],
  ] },
  { label: "NARZĘDZIA", items: [
    ["products", "Katalog", Package], ["licenses", "Umowy i odnowienia", ShieldCheck],
    ["tenders", "Zapytania i przetargi", BriefcaseBusiness], ["campaigns", "Kampanie", Send],
    ["reports", "Raporty", BarChart3], ["documents", "Dokumenty", FolderOpen],
    ["ai", "Copilot", Sparkles], ["automations", "Automatyzacje", Workflow],
  ] },
] as const;
const pageTitles: Record<string, string> = Object.fromEntries(navigation.flatMap(group => group.items.map(([key, label]) => [key, label])));
Object.assign(pageTitles, { team: "Zespół i uprawnienia", settings: "Ustawienia", audit: "Dziennik aktywności", guide: "Instrukcja demo", "your-system": "Twój system z All Day IT" });
const readRoute = () => {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  let id: string | undefined;
  try { id = parts[1] ? decodeURIComponent(parts[1]) : undefined; } catch { /* A malformed hash should not hide the workspace. */ }
  return { page: pageTitles[parts[0]] ? parts[0] : "overview", id };
};
const dayKey = (value: string | Date) => typeof value === "string" ? value.slice(0, 10) : `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
const warsawDateTime = (date: string, time: string) => {
  const offset = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", timeZoneName: "longOffset" }).formatToParts(new Date(`${date}T12:00:00Z`)).find(part => part.type === "timeZoneName")?.value.replace("GMT", "") || "+01:00";
  return `${date}T${time}:00${offset}`;
};
const num = (value: unknown) => Number(value) || 0;
const byCustomer = (items: Entity[], id: string) => items.filter(item => item.customer_id === id);
const stageLabel = (stage: string) => stages.find(item => item.id === stage)?.name || stage;

export default function App() {
  const [state, setState] = useState<DemoState | null>(null);
  const [route, setRoute] = useState(readRoute);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [advanced, setAdvanced] = useState(() => navigation[2].items.some(([key]) => key === readRoute().page));
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [activeMailContext, setActiveMailContext] = useState<string | undefined>(undefined);
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickCreate, setQuickCreate] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("allday-demo-theme") === "dark" ? "dark" : "light"; } catch { return "light"; } });
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: string }[]>([]);
  const [tour, setTour] = useState(-1);
  const [compose, setCompose] = useState<Record<string, any> | null>(null);
  const [createCustomer, setCreateCustomer] = useState(false);
  const [taskModal, setTaskModal] = useState<Record<string, any> | null>(null);
  const notify: Notify = useCallback((text, tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts(old => [...old.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts(old => old.filter(item => item.id !== id)), 5000);
  }, []);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/demo/state", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Nie udało się pobrać przestrzeni demonstracyjnej.");
    const value = await response.json();
    setState(value);
    return value as DemoState;
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/demo/state", { credentials: "same-origin" }).then(response => {
      if (!response.ok) throw new Error("Nie udało się pobrać przestrzeni demonstracyjnej.");
      return response.json();
    }).then(value => { if (active) setState(value); }).catch(err => { if (active) setError(String(err.message)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const changed = () => { const next = readRoute(); setRoute(next); setActiveMailContext(next.page === "mail" ? next.id || "" : undefined); if (navigation[2].items.some(([key]) => key === next.page)) setAdvanced(true); setMobileNav(false); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("allday-demo-theme", theme); } catch { /* The chosen theme also works without browser storage. */ }
  }, [theme]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(old => !old); }
      if (event.key === "Escape") { setMobileNav(false); setSearchOpen(false); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const navigate: Navigate = (page, id) => {
    setActiveMailContext(page === "mail" ? id || "" : undefined);
    if (navigation[2].items.some(([key]) => key === page)) setAdvanced(true);
    window.location.assign(`#/${page}${id ? `/${encodeURIComponent(id)}` : ""}`);
    setSearchOpen(false);
    setSearch("");
  };
  const act: Action = async (type, payload = {}) => {
    const response = await fetch("/api/demo/actions", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    }).catch(() => {
      const message = "Połączenie z demo zostało przerwane. Spróbuj ponownie za chwilę.";
      notify(message, "error");
      throw new Error(message);
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof value.detail === "string" ? value.detail : "Operacja nie powiodła się. Sprawdź dane i spróbuj ponownie.";
      notify(message, "error");
      throw new Error(message);
    }
    if (value.state) setState(value.state);
    else await refresh();
    if (value.message) notify(value.message);
    return value.result ?? value;
  };
  const unread = state?.messages?.filter(item => item.direction === "inbound" && !item.read).length || 0;
  const tourSteps = [
    { page: "overview", title: "Jedno miejsce. Pełny obraz firmy.", text: "Sprawdź wyniki, priorytety oraz sprawy wymagające uwagi. Wszystkie liczby pochodzą z fikcyjnej, spójnej bazy demonstracyjnej." },
    { page: "pipeline", title: "Od kontaktu do wygranej", text: "Przełączaj etapy, otwórz szansę i zmień jej status. Każda zmiana dotyczy tylko Twojej przestrzeni demo." },
    { page: "offers", title: "Od zapytania do profesjonalnej oferty", text: "Utwórz ofertę z katalogu, zmień ilości i ceny, wygeneruj PDF, a następnie przekształć ją w zamówienie." },
    { page: "ai", title: "AI w kontekście konkretnej sprawy", text: "Poznaj analizę dokumentów, źródła i szkic odpowiedzi. Tutaj pokazujemy symulację wyników — żaden model ani zewnętrzne API nie jest wywoływane." },
    { page: "invoices", title: "Sprzedaż połączona z operacjami", text: "Przejdź od oferty do zamówienia, faktury, płatności i odnowienia. Poczta i KSeF są bezpiecznie symulowane." },
  ];
  const startTour = (index = 0) => { setTour(index); navigate(tourSteps[index].page); };
  const hits = useMemo(() => {
    if (!state || search.trim().length < 2) return [];
    const q = search.toLocaleLowerCase("pl");
    return [
      ...state.customers.map(item => ({ type: "Klient", page: "clients", id: item.id, title: item.name, sub: item.email })),
      ...state.deals.map(item => ({ type: "Szansa", page: "pipeline", id: item.id, title: item.title, sub: item.customer })),
      ...state.offers.map(item => ({ type: "Oferta", page: "offers", id: item.id, title: item.number || item.title, sub: item.customer || item.title })),
      ...state.invoices.map(item => ({ type: "Faktura", page: "invoices", id: item.id, title: item.number, sub: item.customer })),
      ...state.messages.map(item => ({ type: "Wiadomość", page: "mail", id: item.id, title: item.subject, sub: item.customer || item.from })),
      ...state.documents.map(item => ({ type: "Dokument", page: "documents", id: item.id, title: item.name || item.title, sub: item.category || "Dokumentacja demo" })),
      ...state.projects.map(item => ({ type: "Projekt", page: "projects", id: item.id, title: item.name || item.title, sub: item.customer })),
      ...((state.tenders || []) as Entity[]).map(item => ({ type: "Przetarg", page: "tenders", id: item.id, title: item.title, sub: item.organization })),
    ].filter(item => `${item.title} ${item.sub}`.toLocaleLowerCase("pl").includes(q)).slice(0, 16);
  }, [state, search]);
  if (!state) return <main className="boot-screen"><Brand/><div className="boot-card">{error ? <><h2>Przestrzeń jest chwilowo niedostępna</h2><p>{error}</p><Button onClick={() => window.location.reload()}><RefreshCw size={16}/> Spróbuj ponownie</Button></> : <><span className="boot-loader"/><h2>Przygotowujemy Twoją przestrzeń</h2><p>CRM, ERP i automatyzacje. W jednym miejscu.</p></>}</div></main>;
  const common = { state, act, navigate, notify, selectedId: route.id };
  return <div className="app-shell universal-shell" data-section={route.page}>
    <a className="skip-content" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Przejdź do treści</a>
    <span className="sr-only" aria-live="polite">{pageTitles[route.page]}</span>
    {mobileNav && <button className="sidebar-scrim" aria-label="Zamknij menu" onClick={() => setMobileNav(false)}/>}
    <aside className={cx("sidebar", mobileNav && "is-open")}>
      <div className="brand-area"><Brand/><button className="icon-button mobile-only" aria-label="Zamknij menu" onClick={() => setMobileNav(false)}><X size={20}/></button></div>
      <button className="workspace scenario-switch" aria-label={`Scenariusz: ${state.meta.profile_label || "Własna przestrzeń"}. Zmień scenariusz`} onClick={() => { setScenarioOpen(true); setMobileNav(false); }}><span className="workspace-avatar">{(state.meta.company_short || state.meta.company || "D").slice(0, 1)}</span><span><strong>{state.meta.company}</strong><small>{state.meta.profile_label || "Własna przestrzeń"}</small></span><ChevronDown size={16}/></button>
      <nav className="main-nav" aria-label="Główna nawigacja">{navigation.map((group, groupIndex) => <div className="nav-group" key={group.label}>{groupIndex === 2 ? <button className="nav-expand" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><Grid2X2 size={16}/><span>Więcej narzędzi</span><ChevronDown size={16} className={advanced ? "rotated" : ""}/></button> : <span className="nav-heading">{group.label}</span>}{(groupIndex !== 2 || advanced) && group.items.map(([key, label, Icon]) => <button key={key} className={cx("nav-link", route.page === key && "active")} onClick={() => navigate(key)} aria-current={route.page === key ? "page" : undefined}><Icon size={19}/><span>{label}</span>{key === "mail" && unread > 0 && <b className="nav-count">{unread}</b>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><button className={cx("nav-link", route.page === "guide" && "active")} onClick={() => navigate("guide")}><BookOpen size={19}/><span>Instrukcja demo</span></button><button className={cx("nav-link", route.page === "settings" && "active")} onClick={() => navigate("settings")}><Settings2 size={19}/><span>Ustawienia</span></button><button className="profile-button" onClick={() => navigate("team")}><Avatar name={state.meta.user_name || state.team[0]?.name || "Zespół"} small/><span><strong>{state.meta.user_name || state.team[0]?.name}</strong><small>{state.meta.role === "viewer" ? "Tylko odczyt" : state.meta.role === "sales" ? "Opiekun" : "Administrator"}</small></span><MoreHorizontal size={17}/></button></div>
    </aside>
    <div className="workspace-main">
      <header className="topbar"><div className="topbar-start"><button className="icon-button mobile-only" aria-label="Otwórz menu" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={22}/></button><span className="breadcrumb"><b>{pageTitles[route.page]}</b></span><button className="demo-mode" onClick={() => setHelpOpen(true)} aria-label="Zasady demonstracji">DEMO</button></div><div className="topbar-actions"><button className="system-cta" onClick={() => navigate("your-system")}><Sparkles size={16}/><span>Twój system</span><ArrowUpRight size={15}/></button><button className="global-search" aria-label="Szukaj w całym systemie (Ctrl+K)" onClick={() => setSearchOpen(true)}><Search size={18}/><span>Szukaj…</span><kbd>Ctrl K</kbd></button><button className="icon-button quick-create-button" aria-label="Utwórz nowy element" onClick={() => setQuickCreate(true)}><Plus size={21}/></button><button className="icon-button" aria-label={theme === "light" ? "Włącz ciemny motyw" : "Włącz jasny motyw"} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={19}/> : <Sun size={19}/>}</button><button className="icon-button" aria-label="Pomoc i przewodnik" onClick={() => setHelpOpen(true)}><CircleHelp size={20}/></button></div></header>
      <main id="main-content" tabIndex={-1} className="page-content" key={`${state.meta.profile_id || "legacy"}:${route.page}`}>
        {route.page === "overview" && <Dashboard {...common} createCustomer={() => setCreateCustomer(true)} planTask={() => setTaskModal({})} compose={value => setCompose(value)} onGuide={() => navigate("guide")} onConsult={() => navigate("your-system")}/>}
        {route.page === "clients" && <Clients key={route.id || "clients"} {...common} create={() => setCreateCustomer(true)} compose={customer => setCompose({ to: customer.email, customer_id: customer.id })} plan={customer => setTaskModal({ customer_id: customer.id })}/>}
        {route.page === "pipeline" && <Pipeline key={route.id || "pipeline"} {...common}/>}
        {route.page === "mail" && <Mailbox key={route.id || "mail"} {...common} onSelect={id => setActiveMailContext(id || "")} compose={value => setCompose(value)}/>}
        {route.page === "campaigns" && <Campaigns key={route.id || "campaigns"} {...common}/>}
        {route.page === "tenders" && <Tenders key={route.id || "tenders"} {...common} plan={value => setTaskModal(value)}/>}
        {route.page === "automations" && <Automations {...common}/>}
        {route.page === "calendar" && <Calendar key={route.id || "calendar"} {...common} plan={value => setTaskModal(value)}/>}
        {route.page === "ai" && <Copilot {...common}/>}
        {route.page === "team" && <TeamWorkspace {...common}/>}
        {route.page === "guide" && <Guide navigate={navigate} onConsult={() => navigate("your-system")}/>}
        {route.page === "your-system" && <Consultation state={state} navigate={navigate} notify={notify}/>}
        {route.page === "audit" && <Audit {...common}/>}
        {route.page === "settings" && <Settings {...common} theme={theme} setTheme={setTheme} startTour={() => startTour()} scenario={() => setScenarioOpen(true)}/>}
        {["offers", "orders", "invoices", "products", "licenses", "projects", "documents", "reports"].includes(route.page) && <Operations {...common} page={route.page} refresh={refresh}/>}
      </main>
      <footer className="app-footer"><span>All Day IT · System dopasowany do firmy</span><button onClick={() => navigate("guide")}><BookOpen size={14}/> Instrukcja</button><button onClick={() => navigate("audit")}>Historia zmian <ArrowUpRight size={13}/></button></footer>
    </div>
    <QuickTools key={state.meta.profile_id || "legacy"} {...common} page={route.page} selectedId={route.page === "mail" ? activeMailContext ?? route.id : route.id} compose={value => setCompose(value)} plan={value => setTaskModal(value)}/>
    {scenarioOpen && <ScenarioPicker state={state} act={act} onClose={() => setScenarioOpen(false)} onChanged={() => { setScenarioOpen(false); setCompose(null); setTaskModal(null); setCreateCustomer(false); setTour(-1); navigate("overview"); }}/>} 
    {quickCreate && <Modal title="Utwórz" onClose={() => setQuickCreate(false)}><div className="quick-create-grid">{[{label:"Klient",icon:Building2,run:()=>setCreateCustomer(true)},{label:"Oferta",icon:FileText,run:()=>navigate("offers","new")},{label:"Wiadomość",icon:Mail,run:()=>setCompose({})},{label:"Aktywność",icon:CalendarDays,run:()=>setTaskModal({})}].map(item=><button key={item.label} onClick={()=>{setQuickCreate(false);item.run();}}><item.icon size={23}/><strong>{item.label}</strong><ArrowRight size={16}/></button>)}</div></Modal>}
    {helpOpen && <Modal title="Poznaj All Day OS" onClose={() => setHelpOpen(false)} footer={<><Button onClick={() => {setHelpOpen(false);navigate("guide");}}><BookOpen size={16}/> Pełna instrukcja</Button><Button onClick={() => {setHelpOpen(false);navigate("your-system");}}>Twój system <ArrowUpRight size={15}/></Button><Button variant="primary" onClick={() => {setHelpOpen(false);startTour();}}><Play size={16}/> Krótki przewodnik</Button></>}><div className="help-overview"><p>Przejdź od klienta do oferty, realizacji i płatności. Narzędzia na dole ekranu są zawsze pod ręką.</p><div><Mail size={20}/><span><strong>Poczta</strong>Odczyt, odpowiedź i szablony.</span></div><div><Sparkles size={20}/><span><strong>Copilot</strong>Podsumowanie sprawy i źródła.</span></div><div><CalendarDays size={20}/><span><strong>Zadania</strong>Terminy i następne kroki.</span></div><p className="help-demo-note"><ShieldCheck size={17}/> Dane są fikcyjne. Poczta, AI i integracje są symulowane. Zmiany dotyczą tylko tej przeglądarki.</p></div></Modal>}
    <div className="toast-stack" aria-live="polite">{toasts.map(item => <div key={item.id} className={`toast toast-${item.tone}`}>{item.tone === "error" ? <X size={18}/> : <CheckCircle2 size={18}/>}<span>{item.text}</span><button aria-label="Zamknij powiadomienie" onClick={() => setToasts(old => old.filter(toast => toast.id !== item.id))}><X size={15}/></button></div>)}</div>
    {searchOpen && <Modal title="Szukaj w przestrzeni" eyebrow="KLIENCI · OFERTY · WIADOMOŚCI" onClose={() => setSearchOpen(false)}><div className="command-search"><Search size={20}/><input autoFocus placeholder="Nazwa firmy, numer dokumentu, temat…" value={search} onChange={event => setSearch(event.target.value)}/><kbd>ESC</kbd></div>{search.length < 2 ? <div className="search-start"><Search size={32}/><p>Wpisz przynajmniej dwa znaki.</p><small>Wszystkie wyniki dotyczą przykładowych danych.</small></div> : hits.length ? <div className="search-results">{hits.map((hit, index) => <button key={`${hit.page}-${index}`} onClick={() => navigate(hit.page, hit.id)}><span className="search-type">{hit.type}</span><span><strong>{hit.title}</strong><small>{hit.sub}</small></span><ArrowUpRight size={17}/></button>)}</div> : <Empty description="Spróbuj innej nazwy albo numeru dokumentu."/>}</Modal>}
    {createCustomer && <CustomerForm state={state} act={act} onClose={() => setCreateCustomer(false)} onCreated={id => { setCreateCustomer(false); navigate("clients", id); }}/>} 
    {taskModal && <TaskForm state={state} act={act} initial={taskModal} onClose={() => setTaskModal(null)}/>}
    {compose && <Composer state={state} act={act} initial={compose} onClose={() => setCompose(null)}/>}
    {tour >= 0 && <div className="tour-card" role="dialog" aria-label="Przewodnik po systemie"><header><Badge tone="blue">KROK {tour + 1} Z {tourSteps.length}</Badge><button className="icon-button" onClick={() => setTour(-1)} aria-label="Zamknij przewodnik"><X size={18}/></button></header><span className="tour-icon"><Sparkles size={24}/></span><h2>{tourSteps[tour].title}</h2><p>{tourSteps[tour].text}</p><footer><Button variant="ghost" onClick={() => setTour(-1)}>Zakończ</Button><Button variant="primary" onClick={() => tour < tourSteps.length - 1 ? startTour(tour + 1) : setTour(-1)}>{tour < tourSteps.length - 1 ? "Dalej" : "Gotowe"}<ArrowRight size={15}/></Button></footer></div>}
  </div>;
}

function ScenarioPicker({ state, act, onClose, onChanged }: { state: DemoState; act: Action; onClose: () => void; onChanged: () => void }) {
  const [selected, setSelected] = useState(state.meta.profile_id === "legacy" ? "services" : state.meta.profile_id || "services");
  const [busy, setBusy] = useState(false);
  const catalog: Entity[] = state.meta.profile_catalog || [
    { id: "services", label: "Usługi", description: "Klienci, oferty i praca zespołu." },
    { id: "trade", label: "Handel", description: "Produkty, zamówienia i dostawy." },
    { id: "projects", label: "Realizacje", description: "Wyceny, etapy i terminy projektów." },
  ];
  return <Modal title="Scenariusz prezentacji" onClose={() => { if (!busy) onClose(); }} wide footer={<><Button onClick={onClose} disabled={busy}>Anuluj</Button><Button variant="primary" busy={busy} disabled={selected === state.meta.profile_id || state.meta.role === "viewer"} onClick={async () => { setBusy(true); try { await act("set_demo_profile", { profile_id: selected }); onChanged(); } catch {} finally { setBusy(false); } }}>Wczytaj scenariusz <ArrowRight size={16}/></Button></>}><div className="scenario-options">{catalog.map(item => { const Icon = item.id === "trade" ? Package : item.id === "projects" ? BriefcaseBusiness : Users; return <button key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} disabled={busy}><span><Icon size={23}/></span><strong>{item.label}</strong><small>{item.description}</small>{selected === item.id && <CheckCircle2 className="scenario-check" size={18}/>}</button>; })}</div><p className="scenario-note">Wczyta nowy zestaw przykładowych danych tylko w tej przeglądarce. {state.meta.role === "viewer" && "Najpierw zmień rolę w ustawieniach na administratora."}</p></Modal>;
}

function Brand() { return <div className="brand adit-brand"><AllDayLogo/><span><b>All Day<span> OS</span></b><small>CRM · ERP · AI</small></span></div>; }
function PageHeader({ title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) { return <div className="page-heading"><div className="section-heading-title"><h1>{title}</h1>{description && <details className="section-help"><summary aria-label={`Informacje o sekcji ${title}`}><CircleHelp size={17}/></summary><p>{description}</p></details>}</div>{children && <div className="page-heading-actions">{children}</div>}</div>; }
function Kpi({ label, value, note, icon: Icon, tone = "blue" }: { label: string; value: string; trend?: string; note?: string; icon: typeof TrendingUp; tone?: string }) { return <Panel className="kpi"><div className="kpi-head"><span>{label}</span><i className={`icon-tile tile-${tone}`}><Icon size={19}/></i></div><strong className="kpi-value">{value}</strong>{note && note !== "Dane demonstracyjne" && <small>{note}</small>}</Panel>; }

function Clients({ state, act, navigate, notify, selectedId, create, compose, plan }: PageProps & { create: () => void; compose: (customer: Entity) => void; plan: (customer: Entity) => void }) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("");
  const [owner, setOwner] = useState(() => selectedId?.startsWith("owner:") ? state.team.find(member => member.id === selectedId.slice(6))?.name || "" : "");
  const selected = state.customers.find(item => item.id === selectedId);
  if (selected) return <ClientDetail state={state} act={act} navigate={navigate} notify={notify} customer={selected} compose={compose} plan={plan}/>;
  const filtered = state.customers.filter(item => `${item.name} ${item.company} ${item.email} ${item.city} ${item.nip}`.toLocaleLowerCase("pl").includes(query.toLocaleLowerCase("pl")) && (!sector || item.sector === sector) && (!owner || item.owner === owner));
  return <><PageHeader eyebrow="RELACJE, KTÓRE MAJĄ KONTEKST" title="Klienci" description="Jedna baza. Cała historia współpracy. Właściwy następny krok."><Button variant="primary" onClick={create}><Plus size={16}/> Nowy klient</Button></PageHeader><div className="summary-strip"><span><Users size={18}/><b>{state.customers.length}</b> klientów w bazie</span><span><Target size={18}/><b>{state.deals.filter(d => !["won", "lost"].includes(d.stage)).length}</b> otwartych szans</span></div><Panel><div className="list-toolbar"><label className="search-field"><Search size={17}/><input aria-label="Szukaj klientów" placeholder="Firma, e-mail, miasto lub NIP…" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Filtr sektora" value={sector} onChange={e => setSector(e.target.value)}><option value="">Wszystkie branże</option>{Array.from(new Set(state.customers.map(c => c.sector))).map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filtr opiekuna" value={owner} onChange={e => setOwner(e.target.value)}><option value="">Wszyscy opiekunowie</option>{Array.from(new Set(state.customers.map(c => c.owner))).map(value => <option key={value}>{value}</option>)}</select><span className="result-count">{filtered.length} wyników</span></div><div className="table-scroll"><table className="data-table client-list-table"><thead><tr><th>Firma / organizacja</th><th>Kontakt</th><th>Branża</th><th>Opiekun</th><th>Przychód netto</th><th>Status</th><th/></tr></thead><tbody>{filtered.map(customer => <tr key={customer.id} onClick={() => navigate("clients", customer.id)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") navigate("clients", customer.id); }}><td><div className="entity-cell"><Avatar name={customer.name} color={customer.color || "blue"}/><span><strong>{customer.name}</strong><small>{customer.city}</small></span></div></td><td><span>{customer.email}</span><small>{customer.phone}</small></td><td><Badge>{customer.sector}</Badge></td><td><div className="owner-cell"><Avatar name={customer.owner} small/>{customer.owner}</div></td><td><strong>{money(customer.revenue_net || customer.value_net, true)}</strong></td><td><Badge tone={customer.status === "active" ? "green" : "blue"}>{customer.status === "active" ? "Aktywny klient" : customer.status === "prospect" ? "Potencjalny" : customer.status}</Badge></td><td><ChevronRight size={17}/></td></tr>)}</tbody></table></div>{!filtered.length && <Empty/>}<div className="table-footer"><span>{filtered.length} z {state.customers.length} klientów</span><small>Otwórz klienta, aby zobaczyć jego pełną historię.</small></div></Panel></>;
}

function ClientDetail({ state, act, navigate, customer: c, compose, plan }: PageProps & { customer: Entity; compose: (customer: Entity) => void; plan: (customer: Entity) => void }) {
  const [tab, setTab] = useState("history");
  const messages = byCustomer(state.messages, c.id), deals = byCustomer(state.deals, c.id), offers = byCustomer(state.offers, c.id), tasks = byCustomer(state.tasks, c.id);
  const [note, setNote] = useState(String(c.notes || ""));
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await act("update_customer", { id: c.id, notes: note }); } catch {} finally { setBusy(false); } };
  return <><button className="back-link" onClick={() => navigate("clients")}><ArrowLeft size={16}/> Wszyscy klienci</button><div className="client-profile-heading"><Avatar name={c.name} color={c.color}/><div><div className="inline-row"><Badge tone="green">{c.status === "active" ? "Aktywny klient" : "Relacja handlowa"}</Badge><Badge>{c.sector}</Badge></div><h1>{c.name}</h1><p><Building2 size={14}/>{c.city} <span>·</span> Opiekun: {c.owner}</p></div><div className="page-heading-actions"><Button onClick={() => plan(c)}><CalendarDays size={16}/> Zaplanuj</Button><Button onClick={() => compose(c)}><Mail size={16}/> Napisz</Button><Button variant="primary" onClick={() => navigate("offers", `new-customer:${c.id}`)}><Plus size={16}/> Przygotuj ofertę</Button></div></div><div className="client-detail-layout"><aside><Panel className="details-card"><h3>Dane firmy</h3><dl><div><dt>E-mail</dt><dd>{c.email}</dd></div><div><dt>Telefon</dt><dd>{c.phone}</dd></div><div><dt>Miasto</dt><dd>{c.city}</dd></div><div><dt>Identyfikator</dt><dd>{c.nip || "DEMO"}</dd></div><div><dt>Opiekun</dt><dd>{c.owner}</dd></div><div><dt>Przychód netto</dt><dd><strong>{money(c.revenue_net, true)}</strong></dd></div></dl><div className="panel-footnote"><ShieldCheck size={14}/> Dane demonstracyjne</div></Panel><Panel className="details-card"><h3>Notatka zespołu</h3><textarea aria-label="Notatka klienta" rows={5} value={note} onChange={e => setNote(e.target.value)}/><Button onClick={() => void save()} busy={busy}>Zapisz notatkę</Button></Panel></aside><Panel><div className="tabs">{[["history", "Historia", messages.length + tasks.length], ["deals", "Szanse", deals.length], ["offers", "Oferty", offers.length], ["messages", "Wiadomości", messages.length]].map(([key, label, count]) => <button key={String(key)} className={tab === key ? "active" : ""} onClick={() => setTab(String(key))}>{label}<span>{count}</span></button>)}</div>{tab === "history" && <div className="timeline">{[...messages.map(m => ({ id: m.id, date: m.date, title: m.subject, description: m.body, icon: Mail, page: "mail" })), ...tasks.map(t => ({ id: t.id, date: t.starts_at || t.date, title: t.title, description: t.description || (t.type === "meeting" ? "Spotkanie" : t.type === "call" ? "Telefon" : "Zadanie"), icon: CalendarDays, page: "calendar" }))].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(item => <button className="timeline-item" key={`${item.page}-${item.id}`} onClick={() => navigate(item.page, item.id)}><span className="timeline-icon"><item.icon size={17}/></span><div><small>{dateLabel(item.date, true)}</small><strong>{item.title}</strong><p>{String(item.description).slice(0, 155)}</p></div><ArrowUpRight size={15}/></button>)}</div>}{tab === "deals" && <div className="detail-records">{deals.map(d => <button key={d.id} onClick={() => navigate("pipeline", d.id)}><Target size={19}/><span><strong>{d.title}</strong><small>{stageLabel(d.stage)} · {d.owner}</small></span><b>{money(d.value_net, true)}</b></button>)}</div>}{tab === "offers" && <div className="detail-records">{offers.map(o => <button key={o.id} onClick={() => navigate("offers", o.id)}><FileText size={19}/><span><strong>{o.number || o.title}</strong><small>{o.title || o.status}</small></span><b>{money(o.net_total || o.total_net || o.value_net || o.net, true)}</b></button>)}</div>}{tab === "messages" && <div className="detail-records">{messages.map(m => <button key={m.id} onClick={() => navigate("mail", m.id)}><Mail size={19}/><span><strong>{m.subject}</strong><small>{dateLabel(m.date, true)} · {m.direction === "inbound" ? "Odebrana" : "Wysłana"}</small></span><ChevronRight size={16}/></button>)}</div>}{((tab === "history" && !messages.length && !tasks.length) || (tab === "deals" && !deals.length) || (tab === "offers" && !offers.length) || (tab === "messages" && !messages.length)) && <Empty title="Historia dopiero się zaczyna" description="Nowe aktywności tej firmy pojawią się tutaj."/>}</Panel></div></>;
}

function Pipeline({ state, act, navigate, selectedId }: PageProps) {
  const initial = state.deals.find(item => item.id === selectedId);
  const [stage, setStage] = useState(stages.some(stage => stage.id === selectedId?.slice(6)) && selectedId?.startsWith("stage:") ? selectedId.slice(6) : initial?.stage || "proposal");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState(() => selectedId?.startsWith("owner:") ? state.team.find(member => member.id === selectedId.slice(6))?.name || "" : "");
  const [detail, setDetail] = useState<Entity | null>(initial || null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState("");
  const filtered = state.deals.filter(item => item.stage === stage && `${item.title} ${item.customer}`.toLocaleLowerCase("pl").includes(query.toLocaleLowerCase("pl")) && (!owner || item.owner === owner));
  const move = async (id: string, next: string) => { setBusy(id); try { await act("move_deal", { id, stage: next }); if (detail?.id === id) setDetail(null); } catch {} finally { setBusy(""); } };
  const current = stages.find(s => s.id === stage)!;
  return <><PageHeader eyebrow="KAŻDA ROZMOWA MA KOLEJNY KROK" title="Sprzedaż" description="Skup się na jednym etapie. Przenoś sprawy i kontroluj pełny lejek."><Button variant="primary" onClick={() => setCreating(true)}><Plus size={16}/> Nowa szansa</Button></PageHeader><div className="pipeline-stages" role="tablist" aria-label="Etapy sprzedaży">{stages.map(item => { const rows = state.deals.filter(d => d.stage === item.id); return <button role="tab" aria-selected={stage === item.id} key={item.id} className={cx(`stage-tab stage-${item.color}`, stage === item.id && "active")} onClick={() => setStage(item.id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("text/deal-id"); if (id) void move(id, item.id); }}><span className="stage-icon"><item.icon size={21}/></span><span><strong>{item.name}</strong><small>{money(rows.reduce((sum, d) => sum + num(d.value_net), 0), true)}</small></span><b>{rows.length}</b></button>; })}</div><Panel><div className="panel-heading pipeline-heading"><div className="inline-row"><span className={`stage-icon stage-${current.color}`}><current.icon size={24}/></span><div><h2>{current.name}</h2><p>{filtered.length} szans · {money(filtered.reduce((sum, d) => sum + num(d.value_net), 0), true)} netto</p></div></div><div className="toolbar-inline"><label className="search-field"><Search size={16}/><input aria-label="Szukaj szans" placeholder="Szukaj firmy lub szansy…" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Opiekun szans" value={owner} onChange={e => setOwner(e.target.value)}><option value="">Wszyscy opiekunowie</option>{state.team.map(member => <option key={member.id}>{member.name}</option>)}</select></div></div><div className="pipeline-hint"><Workflow size={16}/><span>Przeciągnij na etap lub wybierz „Przenieś”.</span><Badge>{state.deals.length} szans w całym lejku</Badge></div><div className="deal-grid">{filtered.map(item => <article className={`deal-card color-${state.customers.find(c => c.id === item.customer_id)?.color || "blue"}`} key={item.id} draggable={busy !== item.id} onDragStart={e => e.dataTransfer.setData("text/deal-id", item.id)}><button className="deal-open" onClick={() => setDetail(item)}><div className="deal-card-top"><Avatar name={item.customer}/><Badge tone={current.color}>{item.probability}%</Badge></div><h3>{item.title}</h3><p>{item.customer}</p><strong className="deal-value">{money(item.value_net, true)}<small>wartość netto</small></strong><div className="deal-meta"><span><Avatar name={item.owner} small/>{item.owner}</span><time><CalendarDays size={12}/>{dateLabel(item.expected_close)}</time></div></button><div className="deal-card-foot"><select aria-label={`Przenieś szansę ${item.title}`} disabled={busy === item.id} value={item.stage} onChange={e => void move(item.id, e.target.value)}>{stages.map(s => <option key={s.id} value={s.id}>Przenieś do: {s.name}</option>)}</select><span aria-hidden="true">⠿</span></div></article>)}</div>{!filtered.length && <Empty title="Brak szans w tym etapie" description="Przenieś sprawę z innego etapu lub dodaj nową szansę." action={<Button onClick={() => setCreating(true)}><Plus size={15}/> Dodaj szansę</Button>}/>}</Panel>{detail && <Modal title={detail.title} eyebrow="SZANSA SPRZEDAŻY" onClose={() => setDetail(null)} footer={<><Button onClick={() => { setDetail(null); navigate("clients", detail.customer_id); }}>Karta klienta <ArrowUpRight size={15}/></Button><Button variant="primary" onClick={() => { setDetail(null); navigate("offers", `new-customer:${detail.customer_id}`); }}><FileText size={16}/> Przygotuj ofertę</Button></>}><div className="deal-detail-value">{money(detail.value_net)}<Badge tone="blue">{detail.probability}% prawdopodobieństwa</Badge></div><dl className="record-details"><div><dt>Klient</dt><dd>{detail.customer}</dd></div><div><dt>Opiekun</dt><dd>{detail.owner}</dd></div><div><dt>Planowana decyzja</dt><dd>{dateLabel(detail.expected_close)}</dd></div><div><dt>Etap</dt><dd>{stageLabel(detail.stage)}</dd></div></dl><div className="detail-note"><h3>Ustalenia</h3><p>{detail.notes || "Brak dodatkowych ustaleń."}</p></div><Field label="Przenieś do etapu"><select value={detail.stage} onChange={e => void move(detail.id, e.target.value)}>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></Modal>}{creating && <DealForm state={state} act={act} onClose={() => setCreating(false)}/>}</>;
}

function Mailbox({ state, act, selectedId, compose, navigate, onSelect }: PageProps & { compose: (value: Record<string, any>) => void; onSelect: (id?: string) => void }) {
  const initialReadAttempt = useRef(false);
  useEffect(() => {
    const opened = state.messages.find(message => message.id === selectedId);
    if (initialReadAttempt.current || !opened || opened.read || opened.direction !== "inbound") return;
    initialReadAttempt.current = true;
    void act("read_message", {id:opened.id}).catch(() => {});
  }, [selectedId, state.messages, act]);
  const [folder, setFolder] = useState(state.messages.find(message => message.id === selectedId)?.direction === "outbound" ? "sent" : "inbox");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(selectedId || "");
  const [layout, setLayout] = useState(() => {try {return localStorage.getItem("allday-demo-mail-layout") === "bottom" ? "bottom" : "split";} catch {return "split";}});
  const [attachment, setAttachment] = useState<Entity | null>(null);
  const [markBusy, setMarkBusy] = useState(false);
  const list = state.messages.filter(m => (folder === "all" || (folder === "sent" ? m.direction === "outbound" : m.direction === "inbound")) && `${m.subject} ${m.customer} ${m.from} ${m.body}`.toLocaleLowerCase("pl").includes(query.toLocaleLowerCase("pl"))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const message = state.messages.find(m => m.id === activeId);
  const open = async (m: Entity) => { setActiveId(m.id); onSelect(m.id); if (!m.read) { try { await act("read_message", { id: m.id }); } catch {} } };
  return <><PageHeader eyebrow="KOMUNIKACJA W KONTEKŚCIE" title="Poczta" description="Rozmowy, załączniki i klient — bez przełączania między aplikacjami."><Button variant="primary" onClick={() => compose({})}><Plus size={16}/> Napisz wiadomość</Button></PageHeader><Panel className={`mailbox-panel mail-layout-${layout}`}><div className="list-toolbar mail-toolbar"><div className="segmented">{[["inbox", "Odebrane"], ["sent", "Wysłane"], ["all", "Wszystkie"]].map(([id, label]) => <button key={id} className={folder === id ? "active" : ""} onClick={() => { setFolder(id); setActiveId(""); onSelect(); }}>{label}{id === "inbox" && <span>{state.messages.filter(m => m.direction === "inbound" && !m.read).length}</span>}</button>)}</div><label className="search-field"><Search size={16}/><input aria-label="Szukaj wiadomości" placeholder="Szukaj w poczcie…" value={query} onChange={e => setQuery(e.target.value)}/></label><button className="icon-button mark-all-read" aria-label="Oznacz wszystkie wiadomości jako przeczytane" title="Oznacz wszystkie jako przeczytane" disabled={markBusy || !state.messages.some(m => m.direction === "inbound" && !m.read)} onClick={async () => { setMarkBusy(true); try { await act("mark_all_read"); } catch {} finally { setMarkBusy(false); } }}><CheckCheck size={18}/></button><button className="icon-button" title="Zmień układ skrzynki" aria-label="Zmień układ skrzynki" onClick={() => { const next = layout === "split" ? "bottom" : "split"; setLayout(next); try {localStorage.setItem("allday-demo-mail-layout", next);} catch { /* Local layout remains usable. */ } }}><Grid2X2 size={18}/></button></div><div className={cx("mailbox-body", activeId && "message-open")}><div className="message-list">{list.map(m => <button key={m.id} className={cx("message-row", !m.read && "unread", activeId === m.id && "selected")} onClick={() => void open(m)}><Avatar name={m.customer || m.from} small/><span><span className="message-row-top"><strong>{m.customer || m.from}</strong><time>{dateLabel(m.date)}</time></span><b>{m.subject}</b><small>{String(m.body).replace(/\n/g, " ").slice(0, 98)}</small><span className="message-tags">{m.campaign_id && <Badge tone="blue">Kampania</Badge>}{m.classification === "positive" && <Badge tone="green">Zapytanie</Badge>}{m.attachments?.length > 0 && <Paperclip size={13}/>}</span></span>{!m.read && <i className="unread-dot"/>}</button>)}{!list.length && <Empty title="Brak wiadomości" description="Zmień folder lub wyszukiwane hasło."/>}</div><div className="message-detail">{message ? <><div className="message-detail-tools"><button className="back-link mobile-only" onClick={() => {setActiveId("");onSelect();}}><ArrowLeft size={15}/> Lista wiadomości</button><Badge tone={message.direction === "inbound" ? "blue" : "green"}>{message.direction === "inbound" ? "Odebrana" : "Wysłana · symulacja"}</Badge><span>{dateLabel(message.date, true)}</span></div><h2>{message.subject}</h2><div className="message-address"><Avatar name={message.customer || message.from}/><div><strong>{message.from}</strong><small>do: {message.to}</small></div>{message.customer_id && <button className="icon-button" aria-label="Otwórz kartę klienta" onClick={() => navigate("clients", message.customer_id)}><Building2 size={18}/></button>}</div><div className="mail-paper"><p>{message.body}</p><div className="mail-signature"><strong>{message.direction === "outbound" ? state.meta.user_name || state.team[0]?.name : message.customer}</strong><span>{message.direction === "outbound" ? state.meta.company : message.from}</span><small>Wiadomość demonstracyjna</small></div></div>{message.attachments?.length > 0 && <div className="message-attachments"><h4><Paperclip size={15}/> Załączniki ({message.attachments.length})</h4>{message.attachments.map((file: Entity) => <button key={file.id} onClick={() => setAttachment({ ...file, message_id: message.id })}><span className="attachment-icon"><FileText size={21}/></span><span><strong>{file.name}</strong><small>{file.type || "Dokument demonstracyjny"}</small></span><Search size={16}/></button>)}</div>}<div className="message-reply-bar"><Button variant="primary" onClick={() => compose({ to: message.direction === "inbound" ? message.from : message.to, subject: message.subject.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject}`, customer_id: message.customer_id, reply_to_id: message.id })}><ArrowDownLeft size={16}/> Odpowiedz</Button><Button onClick={() => navigate("offers", message.customer_id ? `new-customer:${message.customer_id}` : undefined)}><FileText size={16}/> Przygotuj ofertę</Button></div></> : <Empty title="Wybierz wiadomość" description="Treść i załączniki pojawią się tutaj."/>}</div></div></Panel>{attachment && <Modal title={attachment.name} eyebrow="PODGLĄD ZAŁĄCZNIKA DEMO" wide onClose={() => setAttachment(null)} footer={<Button onClick={() => { window.open(attachment.url || `/api/demo/documents/document/${encodeURIComponent(attachment.id)}.pdf`, "_blank", "noopener,noreferrer"); }}><Download size={16}/> Otwórz PDF</Button>}><Suspense fallback={<p className="loading-note">Wczytywanie podglądu PDF…</p>}><DemoPdf title={attachment.name} url={attachment.url || `/api/demo/documents/document/${encodeURIComponent(attachment.id)}.pdf`}/></Suspense></Modal>}</>;
}

function Composer({ state, act, initial, onClose }: { state: DemoState; act: Action; initial: Record<string, any>; onClose: () => void }) {
  const [to, setTo] = useState(initial.to || "");
  const [subject, setSubject] = useState(initial.subject || "");
  const [body, setBody] = useState(() => {
    const draft = String(initial.body || "").trimEnd();
    const signer = state.meta.user_name || state.team[0]?.name;
    const signature = `\n${signer}\n${state.meta.company}`;
    return draft.endsWith(signature) ? draft.slice(0, -signature.length) : draft;
  });
  const [from, setFrom] = useState(state.team[0]?.email || "kontakt@demo.example");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Entity[]>([]);
  const [minimized, setMinimized] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    composerRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && composerRef.current?.contains(document.activeElement)) { event.preventDefault(); closeRef.current(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); if (previous?.isConnected) previous.focus(); };
  }, []);
  const templates = [
    { name: "Podziękowanie za kontakt", body: "Dzień dobry,\n\ndziękuję za wiadomość i zainteresowanie naszą ofertą. Chętnie przygotujemy propozycję dopasowaną do Państwa potrzeb. Czy możemy umówić krótką rozmowę, aby omówić zakres i termin?\n\nPozdrawiam" },
    { name: "Przesłanie oferty", body: "Dzień dobry,\n\nw załączeniu przesyłam propozycję przygotowaną na podstawie naszych ustaleń. W dokumencie znajdą Państwo zakres, warunki i zestawienie cen. W razie pytań pozostaję do dyspozycji.\n\nPozdrawiam" },
    { name: "Brak zapotrzebowania", body: "Dzień dobry,\n\ndziękuję za informację. Rozumiem, że obecnie nie planują Państwo zakupu. Gdy pojawi się potrzeba, z przyjemnością wrócimy do rozmowy i przygotujemy aktualną propozycję.\n\nPozdrawiam" },
  ];
  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setBusy(true);
    try { await act("send_message", { from, to, subject, body, customer_id: initial.customer_id || "", reply_to_id: initial.reply_to_id || "", attachments: files.map(file => ({ id: file.id, name: file.name || file.title, type: "application/pdf" })) }); onClose(); } catch {} finally { setBusy(false); }
  };
  return <div ref={composerRef} className={cx("compose-window", minimized && "minimized")} role="dialog" aria-label="Nowa wiadomość demonstracyjna"><header><span><Mail size={17}/> Nowa wiadomość <Badge tone="blue">DEMO</Badge></span><div><button onClick={() => setMinimized(!minimized)} aria-label={minimized ? "Rozwiń wiadomość" : "Zminimalizuj wiadomość"}>—</button><button aria-label="Zamknij wiadomość" onClick={onClose}><X size={18}/></button></div></header>{!minimized && <><div className="compose-addresses"><label><span>Od</span><select aria-label="Skrzynka nadawcza" value={from} onChange={e => setFrom(e.target.value)}>{state.team.map(member => <option key={member.id} value={member.email}>{member.name} · {member.email}</option>)}</select></label><label><span>Do</span><input aria-label="Adres odbiorcy" type="email" placeholder="kontakt@firma.example" value={to} onChange={e => setTo(e.target.value)}/></label><label><span>Temat</span><input aria-label="Temat wiadomości" value={subject} onChange={e => setSubject(e.target.value)} placeholder="O czym porozmawiamy?"/></label></div><div className="compose-template"><BookOpen size={15}/><select aria-label="Wybierz szablon odpowiedzi" defaultValue="" onChange={e => { const found = templates.find(t => t.name === e.target.value); if (found) setBody(found.body); }}><option value="">Użyj szablonu odpowiedzi…</option>{templates.map(t => <option key={t.name}>{t.name}</option>)}</select></div><textarea className="compose-body" aria-label="Treść wiadomości" placeholder="Napisz wiadomość…" value={body} onChange={e => setBody(e.target.value)}/><div className="compose-signature"><strong>{state.team.find(m => m.email === from)?.name || state.meta.user_name || "Zespół"}</strong><span>{state.meta.company}</span></div>{files.length > 0 && <div className="compose-files">{files.map(file => <span key={file.id}><FileText size={14}/>{file.name || file.title}<button aria-label={`Usuń załącznik ${file.name || file.title}`} onClick={() => setFiles(old => old.filter(f => f.id !== file.id))}><X size={13}/></button></span>)}</div>}<footer><Button variant="primary" busy={busy} disabled={!to || !subject || !body} onClick={() => void send()}><Send size={15}/> Symuluj wysłanie</Button><label className="compose-attachment"><Paperclip size={17}/><select aria-label="Dodaj przykładowy załącznik" value="" onChange={e => { const file = state.documents.find(d => d.id === e.target.value); if (file && !files.some(f => f.id === file.id)) setFiles(old => [...old, file]); }}><option value="">Załącznik demo</option>{state.documents.slice(0, 8).map(file => <option key={file.id} value={file.id}>{file.name || file.title}</option>)}</select></label><small>Symulacja</small></footer></>}</div>;
}

function Campaigns({ state, act, selectedId, navigate }: PageProps) {
  const [chosen, setChosen] = useState(selectedId || state.campaigns[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState("");
  const [query, setQuery] = useState("");
  const item = state.campaigns.find(c => c.id === chosen) || state.campaigns[0];
  const total = state.campaigns.reduce((sum, c) => sum + num(c.sent), 0);
  const queued = state.campaigns.reduce((sum, c) => sum + num(c.queued), 0);
  const messages = state.messages.filter(message => message.campaign_id === item?.id && message.direction === "outbound").sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const filtered = messages.filter(message => `${message.customer} ${message.to} ${message.subject}`.toLocaleLowerCase("pl").includes(query.toLocaleLowerCase("pl")));
  const preview = messages.find(message => message.id === selectedMessage) || messages[0];
  const run = async (type: string, payload: Record<string, unknown>) => { setBusy(true); try { const result = await act(type, payload); if (result.messages?.[0]) setSelectedMessage(result.messages[0].id); } catch {} finally { setBusy(false); } };
  return <>
    <PageHeader eyebrow="KOMUNIKACJA, KTÓRĄ KONTROLUJESZ" title="Kampanie mailingowe" description="Segmenty, treść i historia każdej wiadomości. Zobacz cały proces w bezpiecznej symulacji."><Badge tone="blue"><ShieldCheck size={13}/> SYMULACJA</Badge></PageHeader>
    <div className="kpi-grid"><Kpi label="Wysłane" value={total.toLocaleString("pl-PL")} icon={Send}/><Kpi label="Odpowiedzi" value={state.campaigns.reduce((s, c) => s + num(c.replies), 0).toLocaleString("pl-PL")} icon={MessageSquare} tone="cyan"/><Kpi label="Pozytywne zapytania" value={state.campaigns.reduce((s, c) => s + num(c.positive), 0).toLocaleString("pl-PL")} icon={Target} tone="green"/><Kpi label="W kolejce" value={queued.toLocaleString("pl-PL")} icon={Clock3} tone="violet"/></div>
    <div className="campaign-workspace"><Panel className="campaign-picker"><h3>Twoje kampanie <span>{state.campaigns.length}</span></h3>{state.campaigns.map(c => <button key={c.id} className={chosen === c.id ? "selected" : ""} onClick={() => { setChosen(c.id); setSelectedMessage(""); setQuery(""); }}><div><strong>{c.name}</strong><Badge tone={c.status === "running" ? "green" : c.status === "paused" ? "amber" : "neutral"}>{c.status === "running" ? "Aktywna" : c.status === "paused" ? "Wstrzymana" : c.status === "completed" ? "Zakończona" : "Zaplanowana"}</Badge></div><small>{c.segment}</small><span>{num(c.sent)} w historii · {num(c.queued)} w kolejce</span><i><b style={{ width: `${Math.min(100, num(c.progress))}%` }}/></i></button>)}</Panel>{item && <div className="campaign-main">
      <Panel className="campaign-hero"><div><Badge tone="blue">KAMPANIA DEMONSTRACYJNA</Badge><h2>{item.name}</h2><p>{item.segment}</p></div><div className="campaign-controls"><Button busy={busy} disabled={!num(item.queued)} onClick={() => void run("update_campaign", { id: item.id, status: item.status === "paused" || item.status === "scheduled" ? "running" : "paused" })}>{item.status === "paused" || item.status === "scheduled" ? <Play size={15}/> : <Pause size={15}/>} {item.status === "paused" || item.status === "scheduled" ? "Wznów" : "Wstrzymaj"}</Button><Button variant="primary" busy={busy} disabled={!num(item.queued) || item.status === "paused"} onClick={() => void run("run_campaign", { id: item.id })}><Play size={15}/> Symuluj partię wysyłki</Button></div></Panel>
      <Panel className="campaign-progress"><div><strong>{num(item.progress).toLocaleString("pl-PL", { maximumFractionDigits: 0 })}%</strong><span>przykładowego planu</span><div className="progress-track"><b style={{ width: `${Math.min(100, num(item.progress))}%` }}/></div></div><dl><div><dt>Wysłane</dt><dd>{item.sent}</dd></div><div><dt>Odpowiedzi</dt><dd>{item.replies}</dd></div><div><dt>Zapytania</dt><dd>{item.positive}</dd></div><div><dt>W kolejce</dt><dd>{item.queued}</dd></div></dl></Panel>
      <div className="campaign-policy"><Clock3 size={22}/><div><strong>08:00–15:00 · Europe/Warsaw</strong><p>Limit {item.limit || 200} na skrzynkę · uruchomienie ręczne w demo.</p></div><Badge tone="green">Bezpieczna symulacja</Badge></div>
      <Panel className="campaign-live"><div className="panel-heading"><div><h2><span className="status-dot"/> Podgląd kampanii live</h2><p>Odbiorcy i pełna treść zapisanych wiadomości demonstracyjnych</p></div><Badge>{messages.length} wiadomości z treścią</Badge></div><div className="campaign-live-notice">Liczniki obejmują przykładową historię. Lista pokazuje wiadomości utworzone w tej sesji.</div><div className="campaign-live-grid"><div className="campaign-recipient-list"><label className="search-field"><Search size={15}/><input aria-label="Szukaj odbiorcy kampanii" placeholder="Firma lub e-mail…" value={query} onChange={e => setQuery(e.target.value)}/></label><div>{filtered.map(message => <button key={message.id} className={preview?.id === message.id ? "selected" : ""} onClick={() => setSelectedMessage(message.id)}><span className="campaign-recipient-icon"><CheckCircle2 size={17}/></span><span><strong>{message.customer || message.to}</strong><small>{message.to}</small><b>{message.subject}</b><time>{dateLabel(message.date, true)} · symulacja</time></span></button>)}{!filtered.length && <Empty title="Brak zapisanych wiadomości" description={query ? "Zmień wyszukiwane hasło." : "Uruchom partię, aby zobaczyć odbiorców i przygotowane treści."}/>}</div></div><div className="campaign-live-preview">{preview ? <><div className="campaign-mail-preview"><div><small>Od</small><span>{preview.from}</span></div><div><small>Do</small><span>{preview.customer} &lt;{preview.to}&gt;</span></div><div><small>Temat</small><strong>{preview.subject}</strong></div><article><p className="campaign-body-text">{preview.body}</p><div className="mail-signature"><strong>{state.meta.user_name || state.team[0]?.name}</strong><span>{state.meta.company}</span><small>Wiadomość demonstracyjna. Bez rzeczywistego nadania.</small></div></article></div><footer><Button onClick={() => navigate("mail", preview.id)}><Mail size={15}/> Otwórz w skrzynce</Button>{preview.customer_id && <Button variant="ghost" onClick={() => navigate("clients", preview.customer_id)}><Building2 size={15}/> Karta klienta</Button>}</footer></> : <Empty title="Podgląd wiadomości" description="Wybierz zapisany przykład albo uruchom symulację partii."/>}</div></div></Panel>
    </div>}</div>
  </>;
}

function Tenders({ state, act, navigate, selectedId, plan }: PageProps & { plan: (initial: Record<string, any>) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [activeId, setActiveId] = useState(selectedId || "");
  const [busy, setBusy] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const tenders = (state.tenders || []) as Entity[];
  const active = tenders.find(item => item.id === activeId);
  const rows = tenders.filter(item => (!status || item.status === status) && `${item.title} ${item.organization} ${item.owner} ${(item.requirements || []).join(" ")}`.toLocaleLowerCase("pl").includes(query.toLocaleLowerCase("pl")));
  const document = active ? state.documents.find(item => item.id === active.document_id) : undefined;
  const analysis = result || document?.analysis;
  const open = (item: Entity) => { setActiveId(item.id); setShowPdf(false); setResult(null); };
  const analyze = async () => { if (!active) return; setBusy(true); try { const value = await act("analyze_document", { id: active.document_id || "doc1", document_id: active.document_id || "doc1", prompt: `Przeanalizuj wymagania: ${active.title}. Wskaż zakres, ilości, ryzyka i brakujące dane przed przygotowaniem oferty.` }); setResult(value); } catch {} finally { setBusy(false); } };
  return <>
    <PageHeader eyebrow="OD WYMAGAŃ DO GOTOWEJ PROPOZYCJI" title="Zapytania i przetargi" description="Dokumentacja, zakres i odpowiedzialność za ofertę. Cały kontekst konkretnej sprawy."><Badge tone="blue">FIKCYJNE POSTĘPOWANIA</Badge></PageHeader>
    <div className="summary-strip"><span><BriefcaseBusiness size={18}/><b>{tenders.length}</b> postępowań</span><span><Wallet size={18}/><b>{money(tenders.reduce((sum, item) => sum + num(item.value_net), 0), true)}</b> łącznej wartości netto</span><span><ShieldCheck size={18}/> Dokumentacja utworzona wyłącznie do demo</span></div>
    <Panel><div className="list-toolbar"><label className="search-field"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Szukaj tematu, organizacji lub wymagania…" aria-label="Szukaj przetargu"/></label><select aria-label="Status przetargu" value={status} onChange={e => setStatus(e.target.value)}><option value="">Wszystkie statusy</option><option value="analysis">W analizie</option><option value="qualified">Zakwalifikowany</option></select><span className="result-count">{rows.length} spraw</span></div>
      <div className="tender-grid">{rows.map(item => <button key={item.id} className="tender-card" onClick={() => open(item)}><div className="tender-top"><span className="icon-tile tile-violet"><BriefcaseBusiness size={21}/></span><Badge tone={item.status === "qualified" ? "green" : "amber"}>{item.status === "qualified" ? "Zakwalifikowany" : "W analizie"}</Badge></div><small>{item.organization}</small><h2>{item.title}</h2><p>{item.needs_summary || (item.requirements || []).slice(0, 2).join(" · ")}</p><div className="tender-facts"><span><CalendarDays size={15}/> Termin {dateLabel(item.deadline)}</span><strong>{money(item.value_net)} <small>netto</small></strong></div><footer><span><Avatar name={item.owner || "Zespół"} small/>{item.owner}</span><b>Otwórz sprawę <ArrowRight size={15}/></b></footer></button>)}</div>{!rows.length && <Empty title="Brak pasujących postępowań" description="Zmień filtr albo wyszukiwane hasło."/>}
    </Panel>
    {active && <Modal title={active.title} eyebrow="POSTĘPOWANIE DEMONSTRACYJNE" wide onClose={() => setActiveId("")} footer={<><Button onClick={() => { plan({ customer_id: active.customer_id || state.customers.find(c => c.name === active.organization)?.id || "", title: `Przygotowanie oferty: ${active.title}`, date: active.deadline, description: (active.requirements || []).join("\n") }); setActiveId(""); }}><CalendarDays size={16}/> Zaplanuj zadanie</Button><Button variant="primary" onClick={() => navigate("offers", `new-tender:${active.id}`)}><Plus size={16}/> Przygotuj ofertę</Button></>}>
      <div className="tender-detail-meta"><div><small>Zamawiający</small><strong>{active.organization}</strong></div><div><small>Termin złożenia</small><strong>{dateLabel(active.deadline)}</strong></div><div><small>Wartość szacunkowa netto</small><strong>{money(active.value_net)}</strong></div><div><small>Osoba odpowiedzialna</small><strong>{active.owner}</strong></div></div>
      <section className="tender-requirements"><h3>Co należy uwzględnić w wycenie?</h3>{active.needs_summary && <p>{active.needs_summary}</p>}<div>{(active.requirements || []).map((requirement: string, i: number) => <p key={i}><span>{i + 1}</span>{requirement}</p>)}</div><small>To fikcyjny zakres. Pozycje, ilości i zgodność oferty wymagają sprawdzenia przed zatwierdzeniem.</small></section>
      <div className="tender-document"><FileText size={25}/><span><strong>{document?.name || document?.title || "Specyfikacja wymagań — DEMO"}</strong><small>{active.source}</small></span><Button onClick={() => setShowPdf(!showPdf)}>{showPdf ? "Ukryj PDF" : "Podgląd PDF"}</Button><Button busy={busy} onClick={() => void analyze()}><Sparkles size={15}/> Analizuj AI</Button></div>
      {showPdf && <Suspense fallback={<p className="loading-note">Wczytywanie dokumentu…</p>}><DemoPdf url={`/api/demo/documents/document/${encodeURIComponent(active.document_id || "doc1")}.pdf`} title="Specyfikacja wymagań DEMO"/></Suspense>}
      {analysis && <div className="tender-analysis"><header><Sparkles size={19}/><h3>Analiza wymagań</h3><Badge tone="violet">SYMULACJA AI</Badge></header><p>{String(analysis.answer || analysis.summary || analysis.content || "Przykładowa analiza jest dostępna w dokumentacji.")}</p>{Array.isArray(analysis.requirements) && <ul>{analysis.requirements.map((item: any, i: number) => <li key={i}>{typeof item === "string" ? item : item.name || item.title || JSON.stringify(item)}</li>)}</ul>}<small>Przykładowy wynik bez wywołania modelu. Człowiek sprawdza źródło i zatwierdza zakres.</small></div>}
    </Modal>}
  </>;
}

function Automations({ state, act, navigate }: PageProps) {
  const [busy, setBusy] = useState("");
  const [activeId, setActiveId] = useState("");
  const [lastResult, setLastResult] = useState<Record<string, any> | null>(null);
  const active = state.automations.find(item => item.id === activeId);
  const run = async (type: string, item: Entity) => { setBusy(`${type}:${item.id}`); try { const value = await act(type, { id: item.id }); if (type === "run_automation") { setLastResult(value); setActiveId(item.id); } } catch {} finally { setBusy(""); } };
  const result = lastResult || active?.last_result;
  return <>
    <PageHeader eyebrow="MNIEJ RĘCZNEJ PRACY. WIĘCEJ KONTROLI." title="Automatyzacje" description="Czytelna reguła: zdarzenie, warunek i następny krok. Przetestuj działanie na fikcyjnych danych."><Badge tone="violet"><Workflow size={13}/> SYMULOWANE WYKONANIE</Badge></PageHeader>
    <div className="automation-summary"><Workflow size={18}/><b>{state.automations.filter(item => item.enabled).length}/{state.automations.length}</b> aktywnych reguł</div>
    <div className="automation-grid">{state.automations.map((item, index) => <Panel className="automation-card" key={item.id}><header><span className={`icon-tile tile-${["blue", "violet", "cyan", "amber", "green"][index % 5]}`}><Workflow size={21}/></span><button className={cx("toggle", item.enabled && "on")} type="button" role="switch" aria-checked={Boolean(item.enabled)} aria-label={`${item.enabled ? "Wyłącz" : "Włącz"} regułę ${item.name}`} disabled={Boolean(busy)} onClick={() => void run("toggle_automation", item)}><span/></button></header><h2>{item.name}</h2><div className="automation-flow"><div><span>GDY</span><strong>{item.trigger}</strong></div><i><ArrowDownLeft size={17}/></i><div><span>WYKONAJ</span><strong>{item.action}</strong></div></div><footer><span><i className={cx("status-dot", !item.enabled && "inactive")}/>{item.enabled ? "Włączona" : "Wyłączona"} · {item.runs} wykonań</span><Button busy={busy === `run_automation:${item.id}`} disabled={Boolean(busy) || !item.enabled} onClick={() => void run("run_automation", item)}><Play size={14}/> Symuluj</Button><button className="icon-button" aria-label={`Szczegóły reguły ${item.name}`} onClick={() => { setActiveId(item.id); setLastResult(null); }}><MoreHorizontal size={18}/></button></footer></Panel>)}</div>
    <div className="inline-notice"><ShieldCheck size={17}/> Kliknij „Symuluj”, aby sprawdzić efekt i zapisać go w historii.</div>
    {active && <Modal title={active.name} eyebrow="PRZEJRZYSTA KONFIGURACJA PROCESU" onClose={() => { setActiveId(""); setLastResult(null); }} footer={<><Button onClick={() => navigate("audit")}><Activity size={16}/> Historia wykonania</Button><Button variant="primary" disabled={!active.enabled || Boolean(busy)} busy={busy === `run_automation:${active.id}`} onClick={() => void run("run_automation", active)}><Play size={16}/> Symuluj wykonanie</Button></>}><div className="automation-flow detailed"><div><span>ZDARZENIE INICJUJĄCE</span><strong>{active.trigger}</strong></div><div><span>WARUNKI I KONTROLA</span><strong>Reguła włączona · dane w sesji demo · kontrola duplikatów</strong></div><div><span>DZIAŁANIE W SYSTEMIE</span><strong>{active.action}</strong></div></div><div className="inline-notice"><ShieldCheck size={17}/> Operacja dotyczy tylko fikcyjnych danych. Ponowienie nie powiela tej samej przetworzonej sprawy.</div>{result && <section className="automation-result"><Badge tone="green"><CheckCircle2 size={13}/> WYKONANIE DEMO ZAKOŃCZONE</Badge><h3>{result.created ? "Utworzono nowy rekord w sesji" : "Sprawdzono regułę"}</h3><p>{String(result.message || result.summary || (result.created ? `Typ: ${result.created_type || "aktywność"}. Rezultat jest dostępny w odpowiednim module oraz historii.` : "Brak nowych spraw spełniających warunki albo istniejący rekord już obsługuje tę sprawę."))}</p><div className="button-row"><Button onClick={() => navigate(result.created_type === "order" ? "orders" : result.created_type === "deal" ? "pipeline" : "calendar", result.order?.id || result.deal?.id || result.task?.id)}><ArrowUpRight size={15}/> Otwórz właściwy moduł</Button></div></section>}</Modal>}
  </>;
}

function Calendar({ state, act, selectedId, plan }: PageProps & { plan: (initial: Record<string, any>) => void }) {
  const [view, setView] = useState(() => window.innerWidth < 750 ? "agenda" : "month");
  const [anchor, setAnchor] = useState(new Date(state.meta.date + "T12:00:00"));
  const [owner, setOwner] = useState(() => selectedId?.startsWith("owner:") ? state.team.find(member => member.id === selectedId.slice(6))?.name || "" : "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Entity | null>(state.tasks.find(t => t.id === selectedId) || null);
  const [busy, setBusy] = useState(false);
  const filtered = state.tasks.filter(t => (!owner || t.owner === owner) && `${t.title} ${t.customer}`.toLocaleLowerCase("pl").includes(query.toLocaleLowerCase("pl")));
  const agendaTasks = filtered.filter(t => dayKey(t.date || t.starts_at) >= dayKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)) && dayKey(t.date || t.starts_at) <= dayKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12))).sort((a, b) => String(a.starts_at || a.date).localeCompare(String(b.starts_at || b.date)));
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from({ length: Math.max(35, Math.ceil((offset + new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()) / 7) * 7) }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i - offset + 1, 12));
  const forDay = (date: Date) => filtered.filter(t => dayKey(t.starts_at || t.date) === dayKey(date));
  const move = (direction: number) => setAnchor(view === "week" ? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + direction*7, 12) : new Date(anchor.getFullYear(), anchor.getMonth()+direction, 1, 12));
  const finish = async (task: Entity) => { if (busy) return; setBusy(true); try { await act("complete_task", { id: task.id }); setSelected(null); } catch {} finally { setBusy(false); } };
  return <><PageHeader eyebrow="CZAS NA WŁAŚCIWE DZIAŁANIA" title="Kalendarz" description="Spotkania, telefony i kolejne kroki powiązane ze sprawami klientów."><Button variant="primary" onClick={() => plan({ date: dayKey(anchor) })}><Plus size={16}/> Zaplanuj aktywność</Button></PageHeader><Panel className="calendar-panel"><div className="calendar-toolbar"><div className="inline-row"><Button onClick={() => setAnchor(new Date(state.meta.date + "T12:00:00"))}>Dzisiaj</Button><button className="icon-button" onClick={() => move(-1)} aria-label="Poprzedni okres"><ChevronLeft size={20}/></button><button className="icon-button" onClick={() => move(1)} aria-label="Następny okres"><ChevronRight size={20}/></button><h2>{new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(anchor)}</h2></div><div className="segmented">{[["month", "Miesiąc"], ["week", "Tydzień"], ["agenda", "Agenda"]].map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</div></div><div className="calendar-filters"><label className="search-field"><Search size={16}/><input aria-label="Szukaj aktywności" placeholder="Szukaj aktywności lub klienta…" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Opiekun aktywności" value={owner} onChange={e => setOwner(e.target.value)}><option value="">Cały zespół</option>{state.team.map(m => <option key={m.id}>{m.name}</option>)}</select><div className="calendar-key"><span><i className="legend-blue"/>Zadanie</span><span><i className="legend-cyan"/>Spotkanie</span><span><i className="legend-violet"/>Telefon</span></div></div>{view === "month" ? <div className="calendar-month"><div className="calendar-weekdays">{["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"].map(d => <span key={d}>{d}</span>)}</div><div className="calendar-days">{days.map(day => <div key={dayKey(day)} className={cx("calendar-day", day.getMonth() !== anchor.getMonth() && "outside", dayKey(day) === state.meta.date && "today")}><button className="day-number" onClick={() => plan({ date: dayKey(day) })} aria-label={`Zaplanuj aktywność ${dateLabel(day.toISOString())}`}>{day.getDate()}</button>{forDay(day).slice(0, 3).map(task => <button className={cx("calendar-event", `event-${task.type}`, task.status === "done" && "done")} key={task.id} onClick={() => setSelected(task)}><b>{String(task.starts_at || "").slice(11, 16) || "09:00"}</b><span>{task.title}</span></button>)}{forDay(day).length > 3 && <button className="calendar-more" onClick={() => { setAnchor(day); setView("agenda"); }}>+{forDay(day).length - 3} więcej</button>}</div>)}</div></div> : view === "week" ? <div className="calendar-week">{Array.from({ length: 7 }, (_, index) => { const day = new Date(anchor); day.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7) + index); return <div key={index} className="week-column"><header><small>{["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"][day.getDay()]}</small><b className={dayKey(day) === state.meta.date ? "today-pill" : ""}>{day.getDate()}</b></header>{forDay(day).map(task => <button key={task.id} className={`week-event event-${task.type}`} onClick={() => setSelected(task)}><time>{String(task.starts_at || "").slice(11, 16)}</time><strong>{task.title}</strong><small>{task.customer}</small><span>{task.owner}</span></button>)}<button className="week-add" onClick={() => plan({ date: dayKey(day) })} aria-label={`Dodaj aktywność na ${dateLabel(day.toISOString())}`}><Plus size={16}/></button></div>; })}</div> : <div className="agenda-list">{agendaTasks.map(task => <button key={task.id} className={cx("agenda-row", task.status === "done" && "done")} onClick={() => setSelected(task)}><time><b>{new Date(task.starts_at || task.date).getDate()}</b><span>{new Intl.DateTimeFormat("pl-PL", { weekday: "short", month: "short" }).format(new Date(task.starts_at || task.date))}</span></time><i className={`task-kind ${task.type === "call" ? "kind-call" : ""}`}>{task.type === "call" ? <Phone size={18}/> : task.type === "meeting" ? <Users size={18}/> : <ListTodo size={18}/>}</i><span><strong>{task.title}</strong><small>{task.customer || "Aktywność zespołu"} · {task.owner}</small></span><b>{String(task.starts_at || "").slice(11, 16)}</b><Badge tone={task.status === "done" ? "green" : "blue"}>{task.status === "done" ? "Wykonane" : "Zaplanowane"}</Badge></button>)}{!agendaTasks.length && <Empty title="Brak aktywności w tym okresie" description="Zmień miesiąc, opiekuna lub zaplanuj kolejne działanie."/>}</div>}</Panel>{selected && <Modal title={selected.title} eyebrow="AKTYWNOŚĆ" onClose={() => setSelected(null)} footer={<><Button disabled={!selected.customer_id} onClick={() => { setSelected(null); if (selected.customer_id) window.location.assign(`#/clients/${selected.customer_id}`); }}>Karta klienta</Button><Button onClick={() => { plan({ ...selected }); setSelected(null); }}><Settings2 size={15}/> Edytuj</Button><Button variant="primary" busy={busy} disabled={selected.status === "done"} onClick={() => void finish(selected)}><Check size={16}/> {selected.status === "done" ? "Wykonane" : "Oznacz jako wykonane"}</Button></>}><dl className="record-details"><div><dt>Termin</dt><dd>{dateLabel(selected.starts_at || selected.date, true)}</dd></div><div><dt>Opiekun</dt><dd>{selected.owner}</dd></div><div><dt>Klient</dt><dd>{selected.customer || "Brak powiązania"}</dd></div><div><dt>Rodzaj</dt><dd>{selected.type === "call" ? "Telefon" : selected.type === "meeting" ? "Spotkanie" : "Zadanie"}</dd></div></dl><div className="detail-note"><h3>Ustalenia i opis</h3><p>{selected.description || "Nie dodano szczegółowego opisu."}</p></div></Modal>}</>;
}

function Copilot({ state, act, navigate }: PageProps) {
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState(state.ai.sources[0]?.id || "");
  const [scenario, setScenario] = useState("tender");
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false);
  const prompts = [
    ["tender", "Przeanalizuj dokument", "Wyciągnij wymagania, terminy i pozycje do wyceny z wybranego dokumentu."],
    ["reply", "Przygotuj odpowiedź", "Przygotuj naturalną odpowiedź na zapytanie klienta, korzystając z dostępnych informacji."],
    ["customer", "Podsumuj relację", "Podsumuj historię współpracy i wskaż następny krok handlowy."],
    ["knowledge", "Znajdź wiedzę", "Znajdź informacje w zatwierdzonej bazie wiedzy i pokaż źródła."],
  ];
  const run = async () => { if (!prompt.trim()) return; setBusy(true); try { const value = await act("ai_assist", { prompt, scenario, source_id: source }); setResult(typeof value === "string" ? { answer: value } : value); } catch {} finally { setBusy(false); } };
  const answer = result?.answer || result?.content || result?.summary || result?.response;
  return <><PageHeader eyebrow="INTELIGENCJA W KONTEKŚCIE TWOJEJ FIRMY" title="Copilot" description="Dokumenty, wymagania i wiedza firmy. Zawsze ze źródłem i kontrolą człowieka."><select className="copilot-mobile-source" aria-label="Źródło Copilota" value={source} onChange={event => setSource(event.target.value)}>{state.ai.sources.map(item => <option key={item.id} value={item.id}>{item.title || item.name}</option>)}</select><Badge tone="violet"><Sparkles size={13}/> Symulacja</Badge></PageHeader><div className="copilot-disclosure"><Sparkles size={15}/> Wyniki przykładowe · sprawdź źródła przed użyciem</div><div className="ai-layout"><aside><Panel className="ai-sources"><div className="panel-heading"><div><h3>Źródła wiedzy</h3><p>Przykładowe materiały firmy</p></div><BookOpen size={18}/></div>{state.ai.sources.map(item => <button key={item.id} className={source === item.id ? "selected" : ""} onClick={() => setSource(item.id)}><FileText size={20}/><span><strong>{item.title || item.name}</strong><small>{item.type || item.category || "Dokument firmowy"}</small></span>{source === item.id && <CheckCircle2 size={16}/>}</button>)}<div className="panel-footnote"><ShieldCheck size={13}/> Wyłącznie fikcyjne dokumenty</div></Panel></aside><div><Panel className="ai-workbench"><div className="ai-welcome"><span><Bot size={29}/></span><h2>W czym mogę pomóc?</h2><p>Wybierz scenariusz albo opisz, co chcesz przygotować.</p></div><div className="prompt-options">{prompts.map(([id, title, text]) => <button key={id} className={scenario === id ? "selected" : ""} onClick={() => { setScenario(id); setPrompt(text); }}><span>{id === "tender" ? <FileText size={19}/> : id === "reply" ? <Mail size={19}/> : id === "customer" ? <Users size={19}/> : <BookOpen size={19}/>}</span><strong>{title}</strong><ArrowUpRight size={15}/></button>)}</div><div className="prompt-input"><textarea aria-label="Polecenie dla demonstracyjnego AI" placeholder="Np. przygotuj zestawienie wymagań i wskaż, co trzeba sprawdzić przed wyceną…" value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}/><div><small>Wynik demonstracyjny · bez wysyłania danych do AI</small><Button variant="primary" busy={busy} disabled={!prompt.trim()} onClick={() => void run()}><Sparkles size={16}/> Przygotuj</Button></div></div></Panel>{result && <Panel className="ai-result"><header><span className="icon-tile tile-violet"><Sparkles size={22}/></span><div><h2>Propozycja do weryfikacji</h2><p>Symulowany rezultat dla demonstracyjnego scenariusza</p></div><Badge tone="violet">PRZYKŁAD</Badge></header>{answer ? <div className="ai-answer">{String(answer)}</div> : <div className="ai-answer">{JSON.stringify(result, null, 2)}</div>}{Array.isArray(result.requirements) && <div className="ai-requirements">{result.requirements.map((r: any, index: number) => <div key={index}><CheckCircle2 size={16}/><span>{typeof r === "string" ? r : r.name || r.title || JSON.stringify(r)}</span></div>)}</div>}<div className="ai-result-source"><BookOpen size={16}/><span><strong>Źródło</strong>{state.ai.sources.find(s => s.id === source)?.title || "Baza wiedzy firmy"}</span><Badge tone="amber">Wymaga akceptacji człowieka</Badge></div><footer><Button onClick={() => navigate("offers")}><FileText size={16}/> Przejdź do ofertowania</Button><small>Nie powstał żaden dokument ani wiadomość poza demo.</small></footer></Panel>}</div></div></>;
}


function Audit({ state }: PageProps) {
  const [q, setQ] = useState("");
  const rows = state.audit.filter(item => `${item.action} ${item.actor} ${item.entity} ${item.detail}`.toLocaleLowerCase("pl").includes(q.toLocaleLowerCase("pl"))).slice().reverse();
  return <><PageHeader eyebrow="PEŁNA HISTORIA ZDARZEŃ" title="Dziennik aktywności" description="Kto, co i kiedy zmienił. Twoje działania w demo także pozostają widoczne."/><Panel><div className="list-toolbar"><label className="search-field"><Search size={16}/><input placeholder="Szukaj działania, osoby lub sprawy…" aria-label="Szukaj w historii" value={q} onChange={e => setQ(e.target.value)}/></label><span className="result-count">{rows.length} zdarzeń</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Czas</th><th>Użytkownik</th><th>Działanie</th><th>Obiekt</th><th>Szczegóły</th></tr></thead><tbody>{rows.map((item, index) => <tr key={item.id || index}><td>{dateLabel(item.date, true)}</td><td><div className="owner-cell"><Avatar name={item.actor || "System"} small/>{item.actor || "System"}</div></td><td><Badge tone="blue">{item.action}</Badge></td><td>{item.entity}</td><td>{typeof item.detail === "object" ? JSON.stringify(item.detail) : item.detail}</td></tr>)}</tbody></table></div>{!rows.length && <Empty/>}</Panel></>;
}

function Settings({ state, act, navigate, theme, setTheme, startTour, scenario }: PageProps & { theme: string; setTheme: (v: string) => void; startTour: () => void; scenario: () => void }) {
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedRole,setSelectedRole] = useState(state.meta.role || "admin");
  return <><PageHeader title="Ustawienia"/><div className="settings-grid settings-simple">
    <Panel className="settings-card"><span className="icon-tile tile-blue"><Building2 size={22}/></span><h2>Scenariusz</h2><p>{state.meta.company} · {state.meta.profile_label || "Własna przestrzeń"}</p><Button onClick={scenario}>Zmień scenariusz <ArrowRight size={15}/></Button></Panel>
    <Panel className="settings-card"><span className="icon-tile tile-violet"><Sun size={22}/></span><h2>Wygląd</h2><div className="theme-choices">{["light", "dark"].map(mode => <button key={mode} aria-pressed={theme === mode} className={theme === mode ? "selected" : ""} onClick={() => setTheme(mode)}><span className={`theme-preview preview-${mode}`}><i/><i/><i/></span>{mode === "light" ? <Sun size={16}/> : <Moon size={16}/>} {mode === "light" ? "Jasny" : "Ciemny"} {theme === mode && <CheckCircle2 size={16}/>}</button>)}</div></Panel>
    <Panel className="settings-card"><span className="icon-tile tile-cyan"><ShieldCheck size={22}/></span><h2>Dostęp</h2><p>Sprawdź działanie uprawnień w swojej sesji.</p><Field label="Rola w demo"><select disabled={busy} value={selectedRole} onChange={event => setSelectedRole(event.currentTarget.value)}><option value="admin">Administrator</option><option value="sales">Opiekun klienta</option><option value="viewer">Tylko odczyt</option></select></Field><Button variant="primary" busy={busy} disabled={selectedRole === (state.meta.role || "admin")} onClick={async () => {setBusy(true);try{await act("set_role",{role:selectedRole});}catch{}finally{setBusy(false);}}}>Zastosuj rolę</Button></Panel>
    <Panel className="settings-card"><span className="icon-tile tile-amber"><CircleHelp size={22}/></span><h2>Pomoc</h2><p>Układ pulpitu i narzędzi zapamiętujemy na tym urządzeniu.</p><Button onClick={startTour}><Play size={16}/> Przewodnik</Button><Button variant="ghost" onClick={() => navigate("audit")}>Historia zmian <ArrowRight size={15}/></Button></Panel>
    <Panel className="settings-card"><span className="icon-tile tile-rose"><RefreshCw size={22}/></span><h2>Przywróć demo</h2><p>Usuwa Twoje zmiany i wczytuje dane bieżącego scenariusza.</p><Button variant="danger" disabled={state.meta.role === "viewer"} onClick={() => setReset(true)}>Przywróć dane</Button></Panel>
  </div>{reset && <Modal title="Przywrócić dane demo?" onClose={() => {if(!busy)setReset(false);}} footer={<><Button disabled={busy} onClick={() => setReset(false)}>Anuluj</Button><Button variant="danger" busy={busy} onClick={async () => {setBusy(true);try{await act("reset");setReset(false);navigate("overview");}catch{}finally{setBusy(false);}}}>Przywróć dane</Button></>}><p>Twoje zmiany w tym scenariuszu zostaną zastąpione przykładowymi danymi. Inne przeglądarki zachowają swoje dane.</p></Modal>}</>;
}

function CustomerForm({ state, act, onClose, onCreated }: { state: DemoState; act: Action; onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "", sector: "Usługi", owner_id: state.team[0]?.id || "", color: "blue", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (key: string, value: string) => setForm(old => ({ ...old, [key]: value }));
  const save = async () => {
    if (!form.name.trim()) return;
    if (form.email && !/^[^\s@]+@[^\s@]+\.example$/i.test(form.email.trim())) { setError("W demo wpisz adres w domenie .example."); return; }
    setBusy(true); setError("");
    try { const result = await act("create_customer", form); onCreated(result.customer?.id || result.id); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Sprawdź dane klienta."); }
    finally { setBusy(false); }
  };
  return <Modal title="Nowy klient" onClose={() => { if (!busy) onClose(); }} footer={<><Button disabled={busy} onClick={onClose}>Anuluj</Button><Button variant="primary" busy={busy} disabled={!form.name.trim() || state.meta.role === "viewer"} onClick={() => void save()}>Dodaj klienta</Button></>}><div className="form-grid"><Field label="Nazwa firmy" className="span-2"><input required autoFocus maxLength={200} placeholder="Np. Nova Studio" value={form.name} onChange={event => change("name", event.target.value)}/></Field><Field label="E-mail" hint="Adres demonstracyjny, np. kontakt@nova.example"><input type="email" placeholder="kontakt@nova.example" value={form.email} onChange={event => change("email", event.target.value)}/></Field><Field label="Telefon"><input type="tel" placeholder="Numer przykładowy" value={form.phone} onChange={event => change("phone", event.target.value)}/></Field><Field label="Miasto"><input value={form.city} onChange={event => change("city", event.target.value)}/></Field><Field label="Branża"><select value={form.sector} onChange={event => change("sector", event.target.value)}>{[...new Set(["Usługi", "Handel", "Produkcja", "Budownictwo", "Instytucja publiczna", "Inna", ...state.customers.map(customer => String(customer.sector))])].map(sector => <option key={sector}>{sector}</option>)}</select></Field><Field label="Opiekun"><select value={form.owner_id} onChange={event => change("owner_id", event.target.value)}>{state.team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="Kolor karty"><div className="color-picker">{["blue", "violet", "cyan", "green", "amber", "rose"].map(color => <button key={color} type="button" aria-label={`Kolor ${color}`} aria-pressed={form.color === color} className={cx(`color-dot dot-${color}`, form.color === color && "selected")} onClick={() => change("color", color)}>{form.color === color && <Check size={14}/>}</button>)}</div></Field><Field label="Notatka" className="span-2"><textarea rows={3} value={form.notes} onChange={event => change("notes", event.target.value)}/></Field></div>{error && <p role="alert" className="form-error">{error}</p>}</Modal>;
}

function DealForm({ state, act, onClose }: { state: DemoState; act: Action; onClose: () => void }) {
  const closeDate = new Date(`${state.meta.date}T12:00:00Z`); closeDate.setUTCDate(closeDate.getUTCDate() + 30);
  const [form, setForm] = useState({ title: "", customer_id: state.customers[0]?.id || "", value_net: "15000", stage: "new", probability: "30", owner_id: state.team[0]?.id || "", expected_close: closeDate.toISOString().slice(0, 10), notes: "" });
  const [busy, setBusy] = useState(false);
  const change = (key: string, value: string) => setForm(old => ({ ...old, [key]: value }));
  return <Modal title="Nowa szansa" onClose={() => { if (!busy) onClose(); }} footer={<><Button disabled={busy} onClick={onClose}>Anuluj</Button><Button variant="primary" busy={busy} disabled={!form.title.trim() || !form.customer_id || state.meta.role === "viewer"} onClick={async () => { setBusy(true); try { await act("create_deal", { ...form, value_net: Number(form.value_net), probability: Number(form.probability) }); onClose(); } catch {} finally { setBusy(false); } }}>Dodaj szansę</Button></>}><div className="form-grid"><Field label="Temat" className="span-2"><input autoFocus value={form.title} onChange={event => change("title", event.target.value)} placeholder="Np. Stała współpraca z klientem"/></Field><Field label="Klient" className="span-2"><select value={form.customer_id} onChange={event => change("customer_id", event.target.value)}>{state.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Wartość netto (PLN)"><input type="number" min="0" step="0.01" value={form.value_net} onChange={event => change("value_net", event.target.value)}/></Field><Field label="Prawdopodobieństwo (%)"><input type="number" min="0" max="100" value={form.probability} onChange={event => change("probability", event.target.value)}/></Field><Field label="Etap"><select value={form.stage} onChange={event => change("stage", event.target.value)}>{stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field><Field label="Opiekun"><select value={form.owner_id} onChange={event => change("owner_id", event.target.value)}>{state.team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="Planowana decyzja"><input type="date" value={form.expected_close} onChange={event => change("expected_close", event.target.value)}/></Field><Field label="Ustalenia" className="span-2"><textarea rows={3} value={form.notes} onChange={event => change("notes", event.target.value)}/></Field></div></Modal>;
}

function TaskForm({ state, act, initial, onClose }: { state: DemoState; act: Action; initial: Record<string, any>; onClose: () => void }) {
  const record = state.tasks.find(task => task.id === initial.id) || initial;
  const [form, setForm] = useState({ title: record.title || "", customer_id: record.customer_id || "", type: record.type || "task", owner_id: record.owner_id || state.team[0]?.id || "", priority: record.priority || "normal", date: record.date || String(record.starts_at || state.meta.date).slice(0, 10), time: String(record.starts_at || "").slice(11, 16) || "10:00", end_time: String(record.ends_at || "").slice(11, 16) || "10:30", description: record.description || "" });
  const [busy, setBusy] = useState(false);
  const change = (key: string, value: string) => setForm(old => ({ ...old, [key]: value }));
  return <Modal title={record.id ? "Edytuj aktywność" : "Zaplanuj aktywność"} onClose={() => { if (!busy) onClose(); }} footer={<><Button disabled={busy} onClick={onClose}>Anuluj</Button><Button variant="primary" busy={busy} disabled={!form.title.trim() || !form.date || form.end_time <= form.time || state.meta.role === "viewer"} onClick={async () => { setBusy(true); try { await act(record.id ? "update_task" : "create_task", { ...form, ...(record.id ? {id:record.id} : {}), starts_at: warsawDateTime(form.date, form.time), ends_at: warsawDateTime(form.date, form.end_time) }); onClose(); } catch {} finally { setBusy(false); } }}>Zapisz aktywność</Button></>}><div className="form-grid"><Field label="Temat" className="span-2"><input autoFocus placeholder="Np. Omówienie oferty" value={form.title} onChange={event => change("title", event.target.value)}/></Field><Field label="Rodzaj"><select value={form.type} onChange={event => change("type", event.target.value)}><option value="task">Zadanie</option><option value="call">Telefon</option><option value="meeting">Spotkanie</option></select></Field><Field label="Opiekun"><select value={form.owner_id} onChange={event => change("owner_id", event.target.value)}>{state.team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="Data"><input type="date" value={form.date} onChange={event => change("date", event.target.value)}/></Field><Field label="Priorytet"><select value={form.priority} onChange={event => change("priority", event.target.value)}><option value="normal">Normalny</option><option value="high">Wysoki</option><option value="low">Niski</option></select></Field><Field label="Od"><input type="time" value={form.time} onChange={event => change("time", event.target.value)}/></Field><Field label="Do" hint={form.end_time <= form.time ? "Koniec musi być później niż początek." : undefined}><input type="time" value={form.end_time} onChange={event => change("end_time", event.target.value)}/></Field><Field label="Klient" className="span-2"><select value={form.customer_id} onChange={event => change("customer_id", event.target.value)}><option value="">Bez powiązania</option>{state.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Ustalenia" className="span-2"><textarea rows={3} value={form.description} onChange={event => change("description", event.target.value)}/></Field></div></Modal>;
}
