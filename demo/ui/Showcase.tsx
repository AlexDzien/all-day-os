import { useState, type ReactNode } from "react";
import {
  ArrowRight, ArrowUpRight, BarChart3, BookOpen, BriefcaseBusiness,
  Building2, CalendarDays, CheckCircle2, CirclePlay, Clock3, FileText,
  Handshake, Layers3, Mail, PackageCheck, Plus, Settings2, Target,
  Users, Wallet,
} from "lucide-react";
import type { DemoState, Entity, Navigate } from "./types";
import { Button, Modal, money } from "./shared";
import "./Showcase.css";

export type Perspective = "sales" | "operations" | "management";
type Props = {
  state: DemoState; navigate: Navigate; createCustomer: () => void; planTask: () => void;
  onGuide?: () => void; onConsult?: () => void;
  children: (state: DemoState, perspective: Perspective, configureRequested: boolean, closeConfigure: () => void) => ReactNode;
};
const perspectives = [
  { id: "sales", label: "Handlowiec", icon: Handshake },
  { id: "operations", label: "Koordynator", icon: Layers3 },
  { id: "management", label: "Zarząd", icon: BarChart3 },
] as const;
const num = (value: unknown) => Number(value) || 0;
const invoiceStatus = (status: string) => ({ paid: "Opłacona", partial: "Częściowa wpłata", overdue: "Po terminie", unpaid: "Do zapłaty" } as Record<string, string>)[status] || "Rozliczenie";
function initialPerspective(): Perspective {
  try { const saved = localStorage.getItem("allday-perspective-v4"); if (perspectives.some(item => item.id === saved)) return saved as Perspective; } catch { /* Preferences are optional. */ }
  return "sales";
}
function initialJourney(key: string): number[] {
  try { const saved: unknown = JSON.parse(localStorage.getItem(key) || "null"); if (Array.isArray(saved)) return [...new Set(saved.filter(item => Number.isInteger(item) && item >= 0 && item < 5))] as number[]; } catch { /* Preferences are optional. */ }
  return [];
}

export function Showcase({ state, navigate, createCustomer, planTask, onGuide, onConsult, children }: Props) {
  const [perspective, setPerspective] = useState<Perspective>(initialPerspective);
  const [configure, setConfigure] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const journeyKey = `allday-showcase-v4:${state.meta.profile_id || "legacy"}`;
  const [done, setDone] = useState(() => initialJourney(journeyKey));
  const choosePerspective = (next: Perspective) => { setPerspective(next); try { localStorage.setItem("allday-perspective-v4", next); } catch { /* In-memory preferences remain available. */ } };
  const toggleStep = (index: number) => { const next = done.includes(index) ? done.filter(item => item !== index) : [...done, index]; setDone(next); try { localStorage.setItem(journeyKey, JSON.stringify(next)); } catch { /* Optional persistence. */ } };
  const consult = () => { if (onConsult) onConsult(); else window.open("https://alldayit.pl/kontakt/", "_blank", "noopener,noreferrer"); };
  const guide = () => { if (onGuide) onGuide(); else navigate("guide"); };

  // A presentation follows an existing linked document chain, never unrelated records.
  const invoice = [...state.invoices].sort((a, b) => String(b.date).localeCompare(String(a.date))).find(row => state.orders.some(order => order.id === row.order_id && state.offers.some(offer => offer.id === order.offer_id)));
  const order = state.orders.find(row => row.id === invoice?.order_id) || state.orders[0];
  const offer = state.offers.find(row => row.id === order?.offer_id) || state.offers[0];
  const customer = state.customers.find(row => row.id === offer?.customer_id) || state.customers[0];
  const process = [
    { label: "Klient", text: customer?.name || "Historia relacji", page: "clients", id: customer?.id, icon: Building2, tone: "blue" },
    { label: "Oferta", text: offer?.number || "Wycena i PDF", page: "offers", id: offer?.id, icon: FileText, tone: "emerald" },
    { label: "Realizacja", text: order?.number || "Plan i odpowiedzialność", page: "orders", id: order?.id, icon: PackageCheck, tone: "amber" },
    { label: "Płatność", text: invoice ? invoiceStatus(invoice.status) : "Faktury i saldo", page: "invoices", id: invoice?.id, icon: Wallet, tone: "violet" },
  ];
  const journey = [
    { title: "Poznaj klienta", text: "Rozmowy, ustalenia i osoba odpowiedzialna - w jednej historii.", page: "clients", id: customer?.id, icon: Building2 },
    { title: "Pokaż ofertę", text: "Pozycje netto, warunki i gotowy dokument PDF.", page: "offers", id: offer?.id, icon: FileText },
    { title: "Przekaż do realizacji", text: "Zamówienie, termin i powiązanie z zaakceptowaną ofertą.", page: "orders", id: order?.id, icon: PackageCheck },
    { title: "Sprawdź rozliczenie", text: "Faktura, saldo i rejestrowanie płatności.", page: "invoices", id: invoice?.id, icon: Wallet },
    { title: "Połącz pracę zespołu", text: "Wspólne terminy i zadania przypisane opiekunom.", page: "calendar", id: undefined, icon: Users },
  ];

  const seller = state.team.find(member => member.role === "sales") || state.team[0];
  const assigned = new Set(state.customers.filter(row => row.owner_id === seller?.id || row.owner === seller?.name).map(row => row.id));
  const owned = (row: Entity) => row.owner_id === seller?.id || row.owner === seller?.name;
  const myRecord = (row: Entity) => owned(row) || assigned.has(row.customer_id);
  const activeOrders = state.orders.filter(row => row.status !== "completed");
  const activeProjects = state.projects.filter(row => row.status !== "completed" && num(row.progress) < 100);
  const deliveryCustomers = new Set([...activeOrders, ...activeProjects].map(row => row.customer_id));
  const messages = state.messages.filter(row => row.direction === "inbound" && (perspective === "sales" ? assigned.has(row.customer_id) : perspective === "operations" ? deliveryCustomers.has(row.customer_id) : row.classification === "positive" || !row.read));
  const tasks = state.tasks.filter(row => row.status !== "done" && (perspective === "sales" ? owned(row) : perspective === "management" ? row.priority === "high" : true));
  const deals = state.deals.filter(row => !["won", "lost"].includes(row.stage) && (perspective !== "sales" || myRecord(row)));
  const offers = state.offers.filter(row => perspective !== "sales" || myRecord(row));
  const scopedState = { ...state, messages, tasks, deals, offers };
  const metrics: { label: string; number: string; hint: string; page: string; targetId?: string; actionLabel: string; icon: typeof Target; tone: string }[] = perspective === "sales" ? [
    { label: "Otwarty lejek opiekuna", number: money(deals.reduce((sum, row) => sum + num(row.value_net), 0), true), hint: `${deals.length} szans opiekuna`, page: "pipeline", actionLabel: "Panel sprzedaży całej firmy", icon: Target, tone: "emerald" },
    { label: "Oferty do decyzji", number: String(offers.filter(row => row.status === "sent").length), hint: "Wysłane oferty opiekuna", page: "offers", actionLabel: "Otwórz wszystkie oferty", icon: FileText, tone: "violet" },
    { label: "Zadania opiekuna", number: String(tasks.length), hint: "Otwarte zadania opiekuna", page: "calendar", targetId: `owner:${seller?.id || ""}`, actionLabel: "Kalendarz opiekuna", icon: CalendarDays, tone: "amber" },
    { label: "Nowe rozmowy", number: String(messages.filter(row => !row.read).length), hint: "Nieprzeczytane od przypisanych klientów", page: "mail", actionLabel: "Otwórz całą pocztę", icon: Mail, tone: "blue" },
  ] : perspective === "operations" ? [
    { label: "Otwarte realizacje", number: String(activeOrders.length), hint: "Zamówienia do obsługi", page: "orders", targetId: "filter:__open", actionLabel: "Pokaż otwarte zamówienia", icon: PackageCheck, tone: "emerald" },
    { label: "Projekty w toku", number: String(activeProjects.length), hint: "Praca między zespołami", page: "projects", targetId: "filter:__inprogress", actionLabel: "Pokaż projekty w toku", icon: BriefcaseBusiness, tone: "violet" },
    { label: "Zadania zespołu", number: String(tasks.length), hint: "Otwarte zadania zespołu", page: "calendar", actionLabel: "Kalendarz całego zespołu", icon: CalendarDays, tone: "amber" },
    { label: "Kontakt przy realizacji", number: String(messages.length), hint: "Rozmowy klientów otwartych spraw", page: "mail", actionLabel: "Otwórz całą pocztę", icon: Mail, tone: "blue" },
  ] : [
    { label: "Przychód netto", number: money(state.stats.revenue_net, true), hint: "Według faktur w bazie", page: "reports", actionLabel: "Otwórz raporty firmy", icon: Wallet, tone: "emerald" },
    { label: "Otwarty lejek", number: money(state.stats.pipeline_net, true), hint: `${deals.length} aktywnych szans firmy`, page: "pipeline", actionLabel: "Panel sprzedaży całej firmy", icon: Target, tone: "violet" },
    { label: "Należności netto", number: money(state.stats.receivables_net, true), hint: "Saldo dokumentów sprzedaży", page: "invoices", targetId: "filter:__balance", actionLabel: "Faktury z pozostałym saldem", icon: FileText, tone: "amber" },
    { label: "Ważne działania", number: String(tasks.length), hint: "Otwarte zadania o wysokim priorytecie", page: "calendar", actionLabel: "Kalendarz całego zespołu", icon: CalendarDays, tone: "blue" },
  ];
  const scope = perspective === "sales" ? `Sprawy opiekuna: ${seller?.name || "zespół sprzedaży"}` : perspective === "operations" ? "Otwarte realizacje i zadania całego zespołu" : "Wyniki firmy i działania o wysokim priorytecie";

  return <div className={`showcase-dashboard perspective-${perspective}`}>
    <div className="sc-topline"><span className="sc-date"><i/>{new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${state.meta.date}T12:00:00`))}</span><Button aria-label="Dostosuj pulpit" onClick={() => setConfigure(true)}><Settings2 size={16}/> Dostosuj pulpit</Button></div>
    <section className="sc-hero" aria-labelledby="sc-title"><div className="sc-copy"><span className="sc-kicker">ALL DAY IT / SYSTEM DLA TWOJEJ FIRMY</span><h1 id="sc-title">Twoja firma.<br/><em>Jeden rytm pracy.</em></h1><p>Klienci, sprzedaż i zespół połączeni w jednym miejscu. Zobacz, jak może działać system dopasowany do Twoich procesów.</p><div className="sc-actions"><Button variant="primary" onClick={() => setJourneyOpen(true)}><CirclePlay size={18}/> Zobacz proces w 5 minut</Button><Button variant="ghost" onClick={consult}>Porozmawiajmy o Twoim systemie <ArrowUpRight size={17}/></Button></div><div className="sc-benefits"><span><CheckCircle2 size={15}/> Jeden kontekst klienta</span><span><CheckCircle2 size={15}/> Wspólna odpowiedzialność</span><span><CheckCircle2 size={15}/> Mniej pracy ręcznej</span></div></div><div className="sc-process"><div className="sc-process-heading"><span>OD PIERWSZEJ ROZMOWY</span><span><i/> Jeden połączony proces</span></div>{process.map((step, index) => <button key={step.page} className={`sc-step sc-${step.tone}`} onClick={() => navigate(step.page, step.id)}><span className="sc-step-number">0{index + 1}</span><span className="sc-step-icon"><step.icon size={20}/></span><span className="sc-step-copy"><strong>{step.label}</strong><small>{step.text}</small></span><ArrowUpRight size={17}/></button>)}<div className="sc-process-foot"><span><Layers3 size={15}/> Powiązane rekordy z danych demo</span><button aria-label="Otwórz dokumentację demo" onClick={guide}><BookOpen size={16}/></button></div></div></section>

    <section className="sc-perspective" aria-label="Perspektywa pracy"><div><span className="sc-section-label">TWÓJ PULPIT PRACY</span><h2>Inna rola. Ten sam obraz firmy.</h2></div><div className="sc-role-tabs" role="group" aria-label="Perspektywa pulpitu">{perspectives.map(item => <button key={item.id} aria-pressed={perspective === item.id} onClick={() => choosePerspective(item.id)}><item.icon size={17}/>{item.label}</button>)}</div></section>
    <div className="sc-scope"><i/>{scope}</div><div className="sc-metrics">{metrics.map(metric => <button key={metric.label} className={`sc-metric sc-${metric.tone}`} onClick={() => navigate(metric.page, metric.targetId)} title={metric.hint} aria-label={`${metric.label}: ${metric.number}. ${metric.hint}. ${metric.actionLabel}.`}><span className="sc-metric-icon"><metric.icon size={19}/></span><span className="sc-metric-label">{metric.label}</span><strong>{metric.number}</strong><small>{metric.actionLabel}</small><ArrowUpRight className="sc-metric-arrow" size={16}/></button>)}</div>

    <div className="sc-work-heading"><h2>Pod ręką</h2><div><Button onClick={planTask}><Plus size={16}/> Aktywność</Button><Button onClick={createCustomer}><Plus size={16}/> Klient</Button><Button variant="primary" onClick={() => navigate("offers", "new")}><Plus size={16}/> Nowa oferta</Button></div></div>
    {children(scopedState, perspective, configure, () => setConfigure(false))}
    <section className="sc-consult"><span className="sc-consult-mark"><Layers3 size={28}/></span><div><span>ZAPROJEKTOWANE WOKÓŁ TWOICH PROCESÓW</span><h2>To dopiero punkt wyjścia.</h2><p>Własne etapy, uprawnienia i połączenia z narzędziami, z których już korzystasz.</p></div><Button onClick={consult}>Twój system z All Day IT <ArrowUpRight size={17}/></Button></section>

    {journeyOpen && <Modal title="Pokaż cały proces w 5 minut" onClose={() => setJourneyOpen(false)} wide footer={<><Button onClick={() => {setJourneyOpen(false);guide();}}><BookOpen size={16}/> Dokumentacja demo</Button><Button variant="primary" onClick={() => { const next = journey.find((_, index) => !done.includes(index)) || journey[0]; setJourneyOpen(false); navigate(next.page, next.id); }}>Otwórz następny krok <ArrowRight size={16}/></Button></>}><div className="sc-journey-intro"><span><Clock3 size={16}/> 5 kroków / około minuty na krok</span><p>Jedna sprawa, powiązane dokumenty i wspólny plan. Zaznacz kroki, które już obejrzałeś.</p></div><div className="sc-journey-list">{journey.map((step, index) => <div key={step.page} className={done.includes(index) ? "is-complete" : ""}><label><input type="checkbox" checked={done.includes(index)} aria-label={`Obejrzano: ${step.title}`} onChange={() => toggleStep(index)}/><span>0{index + 1}</span></label><span className="sc-journey-icon"><step.icon size={21}/></span><div><h3>{step.title}</h3><p>{step.text}</p></div><button onClick={() => { setJourneyOpen(false); navigate(step.page, step.id); }} aria-label={`Pokaż krok: ${step.title}`}><ArrowUpRight size={19}/></button></div>)}</div><div className="sc-journey-progress"><span><CheckCircle2 size={16}/>{done.length} z 5 kroków obejrzanych</span><button onClick={() => { setDone([]); try { localStorage.removeItem(journeyKey); } catch { /* Optional persistence. */ } }}>Wyczyść postęp</button></div></Modal>}
  </div>;
}
