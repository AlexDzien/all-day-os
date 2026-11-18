import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, CalendarDays, Check, CheckCircle2, ChevronRight, FileText, Mail, Plus, Settings2, Target, Wallet } from "lucide-react";
import type { Action, DemoState, Entity, Navigate } from "./types";
import { Avatar, Button, Empty, Modal, Panel, dateLabel, money } from "./shared";
import { Showcase, type Perspective } from "./Showcase";
import "./Dashboard.css";

type Props = { state: DemoState; act: Action; navigate: Navigate; createCustomer: () => void; planTask: () => void; compose: (initial: Record<string, unknown>) => void; onGuide?: () => void; onConsult?: () => void };
const widgets = [
  { id: "mail", label: "Poczta", icon: Mail },
  { id: "tasks", label: "Zadania", icon: CalendarDays },
  { id: "sales", label: "Sprzedaż", icon: Target },
  { id: "revenue", label: "Wyniki", icon: BarChart3 },
  { id: "offers", label: "Ostatnie oferty", icon: FileText },
];
const initialWidgets = ["mail", "tasks", "sales", "revenue"];
function readWidgets(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("allday-dashboard-v3") || "null");
    if (Array.isArray(value) && value.every(id => widgets.some(widget => widget.id === id))) return [...new Set(value)] as string[];
  } catch { /* A damaged preference never prevents opening the dashboard. */ }
  return initialWidgets;
}
const value = (number: unknown) => Number(number) || 0;
const monthLabel = (item: Entity) => {
  const label = String(item.month || item.label || "");
  return /^\d{4}-\d{2}/.test(label) ? new Intl.DateTimeFormat("pl-PL", {month:"short"}).format(new Date(`${label.slice(0,7)}-15T12:00:00Z`)) : label;
};

export function Dashboard(props: Props) {
  return <Showcase {...props}>{(state, perspective, configureRequested, closeConfigure) => <DashboardWorkspace {...props} state={state} perspective={perspective} configureRequested={configureRequested} closeConfigure={closeConfigure}/>}</Showcase>;
}

function DashboardWorkspace({ state, act, navigate, createCustomer, planTask, compose, perspective, configureRequested, closeConfigure }: Props & { perspective: Perspective; configureRequested: boolean; closeConfigure: () => void }) {
  const [visible, setVisible] = useState(readWidgets);
  const [configure, setConfigure] = useState(false);
  const [pending, setPending] = useState("");
  const [period, setPeriod] = useState(6);
  const saveWidgets = (next: string[]) => { setVisible(next); try { localStorage.setItem("allday-dashboard-v3", JSON.stringify(next)); } catch { /* Preferences still work in memory. */ } };
  const unread = state.messages.filter(message => message.direction === "inbound" && !message.read);
  const messages = [...state.messages.filter(message => message.direction === "inbound")].sort((a, b) => Number(a.read) - Number(b.read) || b.date.localeCompare(a.date)).slice(0, 3);
  const tasks = state.tasks.filter(task => task.status !== "done").sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))).slice(0, 4);
  const activeDeals = state.deals.filter(deal => !["won", "lost"].includes(deal.stage));
  const offers = [...state.offers].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 4);
  const series = state.revenue_series.slice(-period);
  const peak = Math.max(1, ...series.map(item => value(item.revenue_net ?? item.revenue)));
  const seriesTotal = series.reduce((sum, item) => sum + value(item.revenue_net ?? item.revenue), 0);
  const revenue = (item: Entity) => value(item.revenue_net ?? item.revenue);
  const point = (item: Entity, index: number) => `${40 + index * 490 / Math.max(1, series.length - 1)},${160 - revenue(item) / peak * 125}`;
  const complete = async (id: string) => { setPending(id); try { await act("complete_task", { id }); } catch { /* The action layer displays the error. */ } finally { setPending(""); } };
  const card = (id: string, title: string, page: string, children: ReactNode, action?: ReactNode) => <Panel key={id} className={`dashboard-widget widget-${id}`}><header><h2>{title}{id === "mail" && unread.length > 0 && <b className="db-count">{unread.length}</b>}</h2><div>{action}<button className="db-link" onClick={() => navigate(page)} aria-label={page === "mail" ? "Otwórz pocztę" : page === "calendar" ? "Otwórz kalendarz" : page === "pipeline" ? "Otwórz sprzedaż" : page === "reports" ? "Otwórz raporty" : page === "orders" ? "Otwórz realizacje" : "Otwórz oferty"}><ArrowRight size={18}/></button></div></header>{children}</Panel>;
  return <div className="dashboard-v3">
    <div className="db-heading"><div><span>{new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${state.meta.date}T12:00:00`))}</span><h1>Pulpit</h1></div><div className="db-actions"><Button aria-label="Dostosuj pulpit" onClick={() => setConfigure(true)}><Settings2 size={17}/><span>Dostosuj</span></Button><Button onClick={createCustomer}><Plus size={17}/><span>Klient</span></Button><Button variant="primary" onClick={() => navigate("offers", "new")}><Plus size={17}/> Nowa oferta</Button></div></div>
    <div className="db-metrics">
      {[
        { label: "Przychód netto", number: money(state.stats.revenue_net, true), hint: "Według faktur w bazie", page: "reports", icon: Wallet },
        { label: "Otwarte szanse", number: money(state.stats.pipeline_net, true), hint: `${activeDeals.length} spraw w toku`, page: "pipeline", icon: Target },
        { label: "Do zapłaty netto", number: money(state.stats.receivables_net, true), hint: "Według sald faktur", page: "invoices", icon: FileText },
        { label: "Nowe wiadomości", number: String(unread.length), hint: "Nieprzeczytane", page: "mail", icon: Mail },
      ].map(metric => <button key={metric.label} className="db-metric" onClick={() => navigate(metric.page)} title={metric.hint}><span><metric.icon size={17}/>{metric.label}<ChevronRight size={14}/></span><strong>{metric.number}</strong><small>{metric.hint}</small></button>)}
    </div>
    <div className="db-grid">{visible.map(id => {
      if (id === "mail") return card(id, "Poczta", "mail", <>{messages.length ? <div className="db-rows">{messages.map(message => <button className={`db-mail ${message.read ? "is-read" : "is-unread"}`} key={message.id} onClick={() => navigate("mail", message.id)}><Avatar name={message.customer || message.from} small/><span><strong>{message.customer || message.from}</strong><small>{message.subject}</small></span><time>{dateLabel(message.date)}</time>{!message.read && <i aria-label="Nieprzeczytana"/>}</button>)}</div> : <Empty title="Skrzynka jest pusta" description="Nowa rozmowa zaczyna się od wiadomości."/>}<footer><Button onClick={() => compose({})}><Plus size={16}/> Napisz</Button><span>{unread.length} nieprzeczytanych</span></footer></>);
      if (id === "tasks") return card(id, "Najbliższe zadania", "calendar", <>{tasks.length ? <div className="db-rows">{tasks.map(task => <div className="db-task" key={task.id}><button className="db-check" disabled={pending === task.id || state.meta.role === "viewer"} aria-label={`Ukończ ${task.title}`} onClick={() => void complete(task.id)}><Check size={15}/></button><button className="db-task-open" onClick={() => navigate("calendar", task.id)}><strong>{task.title}</strong><small>{task.customer || task.owner}</small></button><time>{dateLabel(task.starts_at || task.date, true)}</time></div>)}</div> : <Empty title="Wszystko zrobione" description="Możesz zaplanować kolejny krok."/>}<footer><Button onClick={planTask}><Plus size={16}/> Zaplanuj</Button><span>{state.tasks.filter(task => task.status !== "done").length} otwartych</span></footer></>);
      if (id === "sales" && perspective === "operations") return card(id, "Realizacje w toku", "orders", <div className="sc-order-list">{state.orders.filter(row => !["done", "completed", "cancelled"].includes(row.status)).slice(0, 4).map(order => <button key={order.id} onClick={() => navigate("orders", order.id)}><FileText size={19}/><span><strong>{order.customer}</strong><small>{order.number}</small></span><b>{money(order.net_total, true)}</b><ChevronRight size={16}/></button>)}</div>);
      if (id === "sales") return card(id, "Sprzedaż", "pipeline", <><div className="db-sales">{[["new", "Nowe"], ["contacted", "W kontakcie"], ["qualified", "Zakwalifikowane"], ["proposal", "Oferty"]].map(([stage, label]) => { const rows = state.deals.filter(deal => deal.stage === stage); return <button key={stage} onClick={() => navigate("pipeline", `stage:${stage}`)}><span>{label}</span><strong>{rows.length}</strong><small>{money(rows.reduce((sum, deal) => sum + value(deal.value_net), 0), true)}</small></button>; })}</div><div className="db-offer-rows">{offers.slice(0, 2).map(offer => <button key={offer.id} onClick={() => navigate("offers", offer.id)}><FileText size={17}/><span><strong>{offer.customer}</strong><small>{offer.number}</small></span><b>{money(offer.net_total, true)}</b><ChevronRight size={15}/></button>)}</div></>);
      if (id === "revenue") return card(id, "Wyniki firmy", "reports", <><div className="db-chart-summary"><strong>{money(seriesTotal, true)}<small>netto</small></strong><select aria-label="Okres wykresu" value={period} onChange={event => setPeriod(Number(event.target.value))}><option value={6}>6 miesięcy</option><option value={12}>12 miesięcy</option></select></div><svg className="db-chart" viewBox="0 0 560 200" role="img" aria-label={`Przychód netto za ${series.length} miesięcy: ${money(seriesTotal, true)}`}><defs><linearGradient id="db-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".18"/><stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>{[0, 1, 2].map(index => <line key={index} x1="35" x2="540" y1={35 + index * 63} y2={35 + index * 63} stroke="var(--border)" strokeDasharray="3 5"/>)}{series.length > 1 && <><path d={`M${series.map(point).join(" L")} L530,160 L40,160Z`} fill="url(#db-chart-fill)"/><polyline points={series.map(point).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}{series.map((item, index) => <g key={item.id || index}><circle cx={40 + index * 490 / Math.max(1, series.length - 1)} cy={160 - revenue(item) / peak * 125} r="4" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2"><title>{String(item.month || item.label)}: {money(revenue(item))}</title></circle>{(series.length <= 6 || index % 2 === 0) && <text x={40 + index * 490 / Math.max(1, series.length - 1)} y="188" textAnchor="middle" fill="var(--muted)" fontSize="12">{monthLabel(item)}</text>}</g>)}</svg></>);
      if (id === "offers") return card(id, "Ostatnie oferty", "offers", <div className="db-offer-rows">{offers.map(offer => <button key={offer.id} onClick={() => navigate("offers", offer.id)}><FileText size={17}/><span><strong>{offer.customer}</strong><small>{offer.number}</small></span><b>{money(offer.net_total, true)}</b><ChevronRight size={15}/></button>)}</div>);
      return null;
    })}</div>
    {!visible.length && <Empty title="Pulpit po Twojemu" description="Wybierz narzędzia, które chcesz mieć pod ręką." action={<Button onClick={() => setConfigure(true)}>Dodaj widgety</Button>}/>}
    {(configure || configureRequested) && <Modal title="Dostosuj pulpit" onClose={() => {setConfigure(false);closeConfigure();}} footer={<><Button onClick={() => saveWidgets(initialWidgets)}>Przywróć układ</Button><Button variant="primary" onClick={() => {setConfigure(false);closeConfigure();}}><Check size={16}/> Gotowe</Button></>}><div className="db-widget-settings">{widgets.map(widget => { const position = visible.indexOf(widget.id); return <div key={widget.id}><label><input type="checkbox" checked={position >= 0} onChange={() => saveWidgets(position < 0 ? [...visible, widget.id] : visible.filter(id => id !== widget.id))}/><widget.icon size={19}/>{widget.label}</label><div><button disabled={position <= 0} aria-label={`Przesuń ${widget.label} wyżej`} onClick={() => { const next=[...visible]; [next[position-1],next[position]]=[next[position],next[position-1]]; saveWidgets(next); }}><ArrowUp size={16}/></button><button disabled={position < 0 || position === visible.length - 1} aria-label={`Przesuń ${widget.label} niżej`} onClick={() => { const next=[...visible]; [next[position+1],next[position]]=[next[position],next[position+1]]; saveWidgets(next); }}><ArrowDown size={16}/></button></div></div>; })}</div><p className="db-settings-note"><CheckCircle2 size={15}/> Układ zapamiętamy na tym urządzeniu.</p></Modal>}
  </div>;
}
