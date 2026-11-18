import { lockPageScroll } from "./scrollLock";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Calculator, Check, CheckCheck, ChevronRight,
  Clock3, Copy, Inbox, ListTodo, LoaderCircle, Mail, Plus, Send, Settings2,
  Sparkles, X,
} from "lucide-react";
import type { Action, DemoState, Entity, Navigate, Notify } from "./types";
import { money } from "./shared";
import "./QuickTools.css";

type Tool = "mail" | "copilot" | "tasks" | "calculator";
type ActiveTool = Tool | "settings" | null;
type ToolsPreferences = Record<Tool, boolean>;
type AiSource = { id: string; name: string; excerpt: string; url: string };
type AiResult = {
  answer: string;
  context: string;
  contextKey: string;
  customerId?: string;
  messageId?: string;
  to?: string;
  subject?: string;
  sources: AiSource[];
};
type Props = {
  state: DemoState;
  act: Action;
  navigate: Navigate;
  notify: Notify;
  compose: (initial: Record<string, unknown>) => void;
  plan: (initial: Record<string, unknown>) => void;
  page: string;
  selectedId?: string;
};

const PREFERENCE_KEY = "allday-quick-tools-v1";
const DEFAULT_TOOLS: ToolsPreferences = { mail: true, copilot: true, tasks: true, calculator: true };
const TOOLS = [
  { id: "mail", label: "Poczta", icon: Mail },
  { id: "copilot", label: "Copilot", icon: Sparkles },
  { id: "tasks", label: "Zadania", icon: ListTodo },
  { id: "calculator", label: "Kalkulator", icon: Calculator },
] as const;
const PAGE_LABELS: Record<string, string> = {
  overview: "Pulpit", clients: "Klienci", pipeline: "Sprzedaż", mail: "Poczta",
  calendar: "Kalendarz", offers: "Oferty", orders: "Zamówienia", invoices: "Finanse",
  products: "Katalog", licenses: "Umowy i odnowienia", projects: "Projekty",
  tenders: "Przetargi", campaigns: "Kampanie", reports: "Raporty", documents: "Dokumenty",
  ai: "Copilot", automations: "Automatyzacje", settings: "Ustawienia", team: "Zespół",
};

function initialPreferences(): ToolsPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFERENCE_KEY) || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_TOOLS };
    const saved = value as Partial<ToolsPreferences>;
    return Object.fromEntries(TOOLS.map(tool => [tool.id, typeof saved[tool.id] === "boolean" ? saved[tool.id] : true])) as ToolsPreferences;
  } catch { return { ...DEFAULT_TOOLS }; }
}

function dateText(value: unknown, includeTime = true) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "Bez terminu" : new Intl.DateTimeFormat("pl-PL", {
    day: "numeric", month: "short", ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Europe/Warsaw",
  }).format(date);
}

function contextCustomer(state: DemoState, page: string, id?: string): Entity | undefined {
  if (!id) return undefined;
  if (id.startsWith("new-customer:")) return state.customers.find(row => row.id === id.slice("new-customer:".length));
  if (id.startsWith("new-tender:")) {
    const tender = (state.tenders || []).find((row: Entity) => row.id === id.slice("new-tender:".length));
    return tender ? state.customers.find(row => row.id === tender.customer_id) : undefined;
  }
  if (page === "clients") return state.customers.find(row => row.id === id);
  const collections: Record<string, Entity[]> = {
    pipeline: state.deals, mail: state.messages, offers: state.offers, orders: state.orders,
    invoices: state.invoices, calendar: state.tasks, projects: state.projects,
    licenses: state.licenses, tenders: state.tenders || [],
  };
  const record = collections[page]?.find(row => row.id === id);
  return record ? state.customers.find(row => row.id === record.customer_id) : undefined;
}

/** Backend citations can refer to records or a local PDF, never an external URL. */
function sourceTarget(source: AiSource, state: DemoState): { page: string; id?: string } | null {
  const url = source.url.startsWith("/#/") ? source.url.slice(1) : source.url;
  const match = /^#\/(clients|mail|calendar|reports|documents|offers|orders|invoices|projects|pipeline)(?:\/([^/?#]+))?$/.exec(url);
  const collections: Record<string, Entity[]> = {
    clients: state.customers, mail: state.messages, calendar: state.tasks,
    documents: state.documents, offers: state.offers, orders: state.orders,
    invoices: state.invoices, projects: state.projects, pipeline: state.deals,
  };
  if (match) {
    let id: string | undefined;
    try { id = match[2] ? decodeURIComponent(match[2]) : undefined; } catch { return null; }
    if (!id || collections[match[1]]?.some(row => row.id === id)) return { page: match[1], id };
    return null;
  }
  const pdf = /^\/api\/demo\/documents\/document\/([^/?#]+)\.pdf$/.exec(url);
  if (pdf) {
    let id: string;
    try { id = decodeURIComponent(pdf[1]); } catch { return null; }
    return state.documents.some(row => row.id === id) ? { page: "documents", id } : null;
  }
  return !url && state.documents.some(row => row.id === source.id) ? { page: "documents", id: source.id } : null;
}

export function QuickTools(props: Props) {
  return <QuickToolsWorkspace key={String(props.state.meta.profile_id || "default")} {...props}/>;
}

function QuickToolsWorkspace({ state, act, navigate, notify, compose, plan, page, selectedId }: Props) {
  const [active, setActive] = useState<ActiveTool>(null);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [prompt, setPrompt] = useState("");
  const [lastAiResult, setAiResult] = useState<AiResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("1000");
  const [discount, setDiscount] = useState("0");
  const [product, setProduct] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const alive = useRef(true);
  const closeRef = useRef<() => void>(() => {});
  const panelTitleId = useId();
  const customer = contextCustomer(state, page, selectedId);
  const currentMessage = page === "mail" ? state.messages.find(row => row.id === selectedId) : undefined;
  const context = customer?.name || PAGE_LABELS[page] || "Bieżąca sprawa";
  const contextKey = `${page}:${selectedId || ""}`;
  const aiResult = lastAiResult?.contextKey === contextKey ? lastAiResult : null;
  const readOnly = state.meta.role === "viewer";
  const inbox = state.messages.filter(message => message.direction === "inbound");
  const unread = inbox.filter(message => !message.read).length;
  const recentMail = useMemo(() => [...state.messages]
    .filter(message => message.direction === "inbound")
    .sort((left, right) => Number(Boolean(left.read)) - Number(Boolean(right.read)) || String(right.date).localeCompare(String(left.date)))
    .slice(0, 4), [state.messages]);
  const tasks = useMemo(() => [...state.tasks]
    .filter(task => task.status !== "done")
    .sort((left, right) => String(left.starts_at || left.date).localeCompare(String(right.starts_at || right.date)))
    .slice(0, 5), [state.tasks]);
  const numbers = [Number(quantity), Number(price), Number(discount)];
  const validCalculation = quantity.trim() !== "" && price.trim() !== "" && discount.trim() !== "" && numbers.every(Number.isFinite)
    && numbers[0] > 0 && numbers[0] <= 1_000_000 && numbers[1] >= 0 && numbers[1] <= 1_000_000_000 && numbers[2] >= 0 && numbers[2] <= 100;
  const total = validCalculation ? Math.round(numbers[0] * numbers[1] * (1 - numbers[2] / 100) * 100) / 100 : 0;
  const title = active === "settings" ? "Twoje skróty" : TOOLS.find(tool => tool.id === active)?.label;

  useEffect(() => {
    document.body.classList.add("adit-has-quicktools");
    alive.current = true;
    return () => { alive.current = false; document.body.classList.remove("adit-has-quicktools"); };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences)); } catch { /* Preferences are optional when storage is unavailable. */ }
  }, [preferences]);

  const close = (restoreFocus = true) => {
    setActive(null);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  useEffect(() => { closeRef.current = () => close(); });
  useEffect(() => {
    if (!active) return;
    const releaseScroll = lockPageScroll();
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-qt-autofocus],button,input,textarea")?.focus());
    const keyboard = (event: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      if (dialogs.at(-1) !== panelRef.current) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || [])
        .filter(node => node.getClientRects().length > 0);
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", keyboard); releaseScroll(); };
  }, [active]);

  const toggle = (tool: Exclude<ActiveTool, null>) => {
    if (!active) triggerRef.current = document.activeElement as HTMLElement | null;
    setError("");
    setActive(previous => previous === tool ? null : tool);
  };
  const openPage = (target: string, id?: string) => { close(false); navigate(target, id); };
  const newMail = () => { close(false); compose(customer ? { to: customer.email, customer_id: customer.id } : {}); };
  const newTask = () => { close(false); plan(customer ? { customer_id: customer.id } : {}); };
  const runAi = async (question = prompt) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy("ai"); setError(""); setPrompt(text);
    try {
      const value = await act("ai_assist", {
        prompt: `${text}\nKontekst: ${context}. Sekcja: ${PAGE_LABELS[page] || page}.`,
        scope: page, ...(customer ? { customer_id: customer.id } : {}),
        ...(page === "documents" && selectedId ? { document_id: selectedId } : {}),
      });
      if (!alive.current) return;
      setAiResult({
        answer: String(value.answer || value.summary || "Nie znaleziono odpowiedzi dla tego przykładu."),
        context,
        contextKey,
        customerId: customer?.id,
        messageId: currentMessage?.id,
        to: currentMessage ? String(currentMessage.direction === "inbound" ? currentMessage.from : currentMessage.to) : customer?.email,
        subject: currentMessage ? String(currentMessage.subject).toLowerCase().startsWith("re:") ? String(currentMessage.subject) : `Re: ${currentMessage.subject}` : undefined,
        sources: Array.isArray(value.sources) ? value.sources.map((source: Entity) => ({ id: String(source.id || ""), name: String(source.name || "Źródło"), excerpt: String(source.excerpt || ""), url: String(source.url || "") })) : [],
      });
    } catch (problem) { if (alive.current) setError(problem instanceof Error ? problem.message : "Nie udało się przygotować odpowiedzi."); }
    finally { if (alive.current) setBusy(""); }
  };
  const completeTask = async (id: string) => {
    if (busy) return;
    setBusy(id); setError("");
    try { await act("complete_task", { id }); }
    catch (problem) { if (alive.current) setError(problem instanceof Error ? problem.message : "Nie udało się zapisać zadania."); }
    finally { if (alive.current) setBusy(""); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify("Skopiowano do schowka."); }
    catch { notify("Nie można skopiować. Zaznacz tekst i użyj Ctrl+C.", "info"); }
  };

  return <>
    {active && <>
      <button className="qt-overlay" aria-label="Zamknij szybkie narzędzia" tabIndex={-1} onClick={() => close()}/>
      <div ref={panelRef} className={`qt-panel qt-panel-${active}`} role="dialog" aria-modal="true" aria-labelledby={panelTitleId}>
        <header className="qt-panel-header"><div><span className="qt-eyebrow">POD RĘKĄ</span><h2 id={panelTitleId}>{title}</h2></div><button className="qt-icon" type="button" aria-label="Zamknij narzędzie" onClick={() => close()}><X size={20}/></button></header>
        {active !== "settings" && <nav className="qt-panel-tabs" aria-label="Wybierz szybkie narzędzie">{TOOLS.filter(tool => preferences[tool.id]).map(tool => <button key={tool.id} type="button" className={active === tool.id ? "active" : ""} aria-current={active === tool.id ? "page" : undefined} aria-label={tool.label} onClick={() => { setError(""); setActive(tool.id); }}><tool.icon size={17}/><span>{tool.label}</span></button>)}</nav>}
        <div className="qt-panel-body">
          {error && <div className="qt-error" role="alert">{error}</div>}
          {active === "mail" && <>
            <div className="qt-section-toolbar"><span>{unread ? `${unread} nieprzeczytanych` : "Wszystko przeczytane"}</span><button className="qt-link" type="button" onClick={() => openPage("mail")}>Otwórz pocztę <ArrowUpRight size={15}/></button></div>
            <div className="qt-mail-list">{recentMail.map(message => <button key={message.id} type="button" className={`qt-mail-row ${message.read ? "" : "unread"}`} onClick={() => openPage("mail", message.id)}><span className="qt-mail-avatar"><Mail size={17}/>{!message.read && <i/>}</span><span><span className="qt-mail-top"><strong>{message.customer || message.from}</strong><time>{dateText(message.date, false)}</time></span><b>{message.subject}</b><small>{String(message.body || "").replace(/\s+/g, " ").slice(0, 100)}</small></span><ChevronRight size={16}/></button>)}</div>
            {!recentMail.length && <div className="qt-empty"><Inbox size={30}/><strong>Spokojnie, bez nowych wiadomości</strong><span>Nowe rozmowy pojawią się tutaj.</span></div>}
            <button className="qt-primary" type="button" disabled={readOnly} onClick={newMail}><Plus size={18}/> Napisz wiadomość</button>
            {readOnly && <p className="qt-hint">Rola obserwatora ma dostęp tylko do odczytu.</p>}
          </>}
          {active === "copilot" && <>
            <div className="qt-context"><Sparkles size={15}/><span>{context}</span><small>Symulacja AI</small></div>
            <div className="qt-prompts">{[customer ? "Podsumuj relację" : page === "documents" && selectedId ? "Podsumuj wymagania" : "Podsumuj wyniki firmy", "Zaproponuj następny krok", "Przygotuj odpowiedź"].map(question => <button key={question} type="button" disabled={Boolean(busy)} onClick={() => void runAi(question)}>{question}<ArrowRight size={14}/></button>)}</div>
            <form className="qt-ai-form" onSubmit={event => { event.preventDefault(); void runAi(); }}><label htmlFor={`${panelTitleId}-prompt`} className="qt-label">O co chcesz zapytać?</label><textarea id={`${panelTitleId}-prompt`} data-qt-autofocus rows={3} maxLength={1500} placeholder="Np. co warto ustalić przed ofertą?" value={prompt} onChange={event => setPrompt(event.target.value)}/><button className="qt-primary" type="submit" disabled={!prompt.trim() || Boolean(busy)}>{busy === "ai" ? <LoaderCircle size={17} className="qt-spin"/> : <Send size={17}/>} {busy === "ai" ? "Przygotowuję…" : "Zapytaj Copilota"}</button></form>
            {aiResult && <section className="qt-ai-result" aria-live="polite"><header><span><Sparkles size={15}/> Odpowiedź · {aiResult.context}</span><button className="qt-icon" type="button" aria-label="Skopiuj odpowiedź Copilota" onClick={() => void copy(aiResult.answer)}><Copy size={16}/></button></header><p>{aiResult.answer}</p>{aiResult.sources.length > 0 && <details><summary>Źródła ({aiResult.sources.length})</summary>{aiResult.sources.map((source, index) => { const target = sourceTarget(source, state); return <div className="qt-source" key={`${source.id}-${index}`}><button type="button" className="qt-link" disabled={!target} onClick={() => { if (target) openPage(target.page, target.id); }}>{source.name}<ArrowUpRight size={14}/></button>{source.excerpt && <p>{source.excerpt}</p>}</div>; })}</details>}<div className="qt-result-actions"><button type="button" className="qt-link" onClick={() => openPage("ai")}>Pełny Copilot <ArrowRight size={15}/></button>{!readOnly && <button type="button" className="qt-link" onClick={() => { close(false); compose({ body: aiResult.answer, ...(aiResult.to ? { to: aiResult.to } : {}), ...(aiResult.customerId ? { customer_id: aiResult.customerId } : {}), ...(aiResult.subject ? { subject: aiResult.subject } : {}), ...(aiResult.messageId ? { reply_to_id: aiResult.messageId } : {}) }); }}><Mail size={15}/> Użyj w wiadomości</button>}</div></section>}
          </>}
          {active === "tasks" && <>
            <div className="qt-section-toolbar"><span>Najbliższe terminy</span><button type="button" className="qt-link" onClick={() => openPage("calendar")}>Kalendarz <ArrowUpRight size={15}/></button></div>
            <div className="qt-task-list">{tasks.map(task => <div className="qt-task-row" key={task.id}><button type="button" role="checkbox" aria-checked={false} className="qt-check" disabled={Boolean(busy) || readOnly} aria-label={`Ukończ zadanie: ${task.title}`} onClick={() => void completeTask(task.id)}>{busy === task.id ? <LoaderCircle size={16} className="qt-spin"/> : <Check size={16}/>}</button><button className="qt-task-detail" type="button" onClick={() => openPage("calendar", task.id)}><strong>{task.title}</strong><span>{task.customer || "Aktywność wewnętrzna"}</span><time><Clock3 size={12}/>{dateText(task.starts_at || task.date)}</time></button></div>)}</div>
            {!tasks.length && <div className="qt-empty"><CheckCheck size={30}/><strong>Wszystko zrobione</strong><span>Zaplanuj kolejny krok, kiedy go potrzebujesz.</span></div>}
            <button type="button" className="qt-primary" disabled={readOnly} onClick={newTask}><Plus size={18}/> Dodaj zadanie</button>
          </>}
          {active === "calculator" && <>
            <label className="qt-calculator-product qt-label">Produkt lub usługa<select value={product} onChange={event => { const id = event.target.value; setProduct(id); const selected = state.products.find(row => row.id === id); if (selected) setPrice(String(selected.price_net || 0)); }}><option value="">Własna kalkulacja</option>{state.products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <div className="qt-calculator-grid"><label className="qt-label">Ilość<input type="number" min="0.01" step="0.01" max="1000000" value={quantity} onChange={event => setQuantity(event.target.value)}/></label><label className="qt-label">Cena netto (zł)<input type="number" min="0" step="0.01" max="1000000000" value={price} onChange={event => setPrice(event.target.value)}/></label><label className="qt-label qt-discount">Rabat (%)<input type="number" min="0" max="100" step="0.1" value={discount} onChange={event => setDiscount(event.target.value)}/></label></div>
            <div className="qt-calculator-total" aria-live="polite"><span>Razem netto</span><strong>{validCalculation ? money(total) : "—"}</strong>{validCalculation && numbers[2] > 0 && <small>Rabat: {money(numbers[0] * numbers[1] - total)}</small>}</div>
            {!validCalculation && <p className="qt-error" role="alert">Podaj dodatnią ilość, cenę od 0 zł i rabat 0–100%.</p>}
            <div className="qt-calculator-actions"><button type="button" className="qt-secondary" disabled={!validCalculation} onClick={() => void copy(money(total))}><Copy size={16}/> Kopiuj kwotę</button><button type="button" className="qt-primary" disabled={!validCalculation || readOnly} onClick={() => openPage("offers", `new-calculation:${product || "custom"}:${quantity}:${price}:${discount}`)}><ArrowRight size={16}/> Nowa oferta</button></div><p className="qt-hint">Szybkie wyliczenie. Ostateczne pozycje zapiszesz w ofercie.</p>
          </>}
          {active === "settings" && <>
            <p className="qt-settings-intro">Wybierz narzędzia na swoim pasku.</p><div className="qt-settings-list">{TOOLS.map(tool => <label key={tool.id}><span className="qt-setting-icon"><tool.icon size={19}/></span><span>{tool.label}</span><input type="checkbox" checked={preferences[tool.id]} onChange={event => setPreferences(previous => ({ ...previous, [tool.id]: event.target.checked }))}/></label>)}</div><button type="button" className="qt-secondary" onClick={() => setPreferences({ ...DEFAULT_TOOLS })}>Przywróć wszystkie</button><p className="qt-hint">Zapamiętamy wybór na tym urządzeniu.</p>
          </>}
        </div>
      </div>
    </>}
    <nav className="qt-dock" aria-label="Szybkie narzędzia">{TOOLS.filter(tool => preferences[tool.id]).map(tool => <button key={tool.id} className={`qt-tool-${tool.id} ${active === tool.id ? "active" : ""}`} type="button" aria-label={`Szybkie narzędzie: ${tool.label}${tool.id === "mail" && unread ? `, ${unread} nieprzeczytanych` : ""}`} aria-expanded={active === tool.id} onClick={() => toggle(tool.id)}><span className="qt-dock-icon"><tool.icon size={19}/>{tool.id === "mail" && unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</span><span>{tool.label}</span></button>)}<button className={`qt-dock-settings ${active === "settings" ? "active" : ""}`} type="button" aria-label="Dostosuj szybkie narzędzia" aria-expanded={active === "settings"} onClick={() => toggle("settings")}><Settings2 size={18}/><span>Skróty</span></button></nav>
  </>;
}
