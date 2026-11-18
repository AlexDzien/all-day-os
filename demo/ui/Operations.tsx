import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BadgeCheck, Building2,
  CalendarDays, Check, CheckCircle2, ChevronRight, Copy, Grid2X2, List,
  CreditCard, Download, FileClock, FilePlus2, FileSearch,
  FileText, FolderKanban, Layers3, Package, Pencil, Plus, ReceiptText,
  RefreshCw, Search, ShieldCheck, Sparkles, Tag, Trash2, TrendingUp, TriangleAlert,
  Wallet, X,
} from "lucide-react";
import { Avatar, Badge, Button, Empty, Field, Modal, Panel, dateLabel, money } from "./shared";
import type { Action, DemoState, Entity, Navigate, Notify } from "./types";
import "./operations.css";

const DemoPdf = lazy(() => import("./DemoPdf"));

type Props = {
  page: string; state: DemoState; act: Action; refresh?: () => unknown;
  navigate: Navigate; notify: Notify; selectedId?: string;
};
type Selected = { kind: string; id: string } | null;
type DraftLine = {
  key: string; product_id: string; name: string; quantity: number; unit: string;
  price_net: number; discount_pct: number; vat: number;
};
type OfferEditorState = { initial?: Entity; product?: Entity; license?: Entity } | null;
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const rounded = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const sum = (rows: Entity[], key: string) => rows.reduce((total, row) => total + num(row[key]), 0);
const lower = (v: unknown) => String(v ?? "").toLocaleLowerCase("pl");
const includes = (row: Entity, query: string, keys: string[]) => keys.some(key => lower(row[key]).includes(lower(query)));
const statusNames: Record<string, string> = {
  draft: "Robocza", sent: "Wysłana", accepted: "Zaakceptowana", rejected: "Odrzucona",
  new: "Nowe", processing: "W realizacji", completed: "Zakończone", active: "Aktywne",
  unpaid: "Nieopłacona", partial: "Częściowo opłacona", paid: "Opłacona", overdue: "Po terminie",
  not_sent: "Nieprzesłana", accepted_demo: "Przyjęta · DEMO", expiring: "Do odnowienia",
  expired: "Wygasła", at_risk: "Wymaga uwagi", on_track: "Zgodnie z planem",
  ready: "Gotowy", indexed: "Zindeksowany", analyzed: "Przeanalizowany", approved: "Zatwierdzony", uploaded: "Nowy",
  done: "Wykonane", todo: "Do wykonania", in_progress: "W toku", planned: "Planowany", paused: "Wstrzymany",
};
const statusTone = (value: string) => /^(accepted|completed|paid|active|on_track|ready|indexed|analyzed|approved|done|accepted_demo)$/.test(value)
  ? "good" : /^(overdue|expired|rejected|at_risk)$/.test(value) ? "bad" : /^(partial|expiring|processing|in_progress)$/.test(value) ? "warn" : "neutral";
function Status({ value = "", label }: { value?: string; label?: string }) {
  return <Badge tone={statusTone(value)}>{label || statusNames[value] || value || "Nowy"}</Badge>;
}
function Metric({ label, value, detail, icon, tone = "blue", onClick, active = false }: { label: string; value: ReactNode; detail: ReactNode; icon: ReactNode; tone?: string; onClick?: () => void; active?: boolean }) {
  const content = <><span className={`ops-metric-icon ${tone}`} aria-hidden="true">{icon}</span><span>{label}</span><strong>{value}</strong><small>{detail}</small>{onClick && <ArrowUpRight className="ops-metric-arrow" size={17}/>}</>;
  return onClick ? <button type="button" className={`ops-metric ${active ? "is-active" : ""}`} onClick={onClick} aria-pressed={active}>{content}</button> : <div className="ops-metric">{content}</div>;
}

const scopeNames: Record<string, string> = {
  __open: "Otwarte zamówienia", __balance: "Z pozostałym saldem", __received: "Z zarejestrowaną wpłatą",
  __active: "Aktywne umowy", __expiring: "Odnowienie do 90 dni", __analysable: "Gotowe do analizy",
  __analysed: "Przeanalizowane", __agreements: "Umowy", __inprogress: "Projekty w toku", __risk: "Wymagające uwagi",
};
function matchesScope(row: Entity, filter: string) {
  if (filter === "__open") return row.status !== "completed";
  if (filter === "__balance") return num(row.balance_gross) > 0;
  if (filter === "__received") return num(row.paid_gross) > 0;
  if (filter === "__active") return row.status !== "expired";
  if (filter === "__expiring") return num(row.days_remaining) >= 0 && num(row.days_remaining) <= 90;
  if (filter === "__analysable") return Boolean(row.source_text);
  if (filter === "__analysed") return Boolean(row.analysis) || row.status === "analyzed";
  if (filter === "__agreements") return lower(row.category).includes("umow");
  if (filter === "__inprogress") return row.status !== "completed" && num(row.progress) < 100;
  if (filter === "__risk") return row.status === "at_risk" || row.status === "paused";
  return row.status === filter || row.category === filter || row.kind === filter;
}

function DocumentTrail({ state, navigate, kind, record, onPayment }: { state: DemoState; navigate: Navigate; kind: string; record?: Entity; onPayment?: () => void }) {
  const offer = record ? kind === "offers" ? record : kind === "orders" ? state.offers.find(row => row.id === record.offer_id) : state.offers.find(row => row.id === state.orders.find(order => order.id === record.order_id)?.offer_id) : undefined;
  const order = record ? kind === "orders" ? record : kind === "offers" ? state.orders.find(row => row.offer_id === record.id) : state.orders.find(row => row.id === record.order_id) : undefined;
  const invoice = record ? kind === "invoices" ? record : state.invoices.find(row => row.order_id === order?.id) : undefined;
  const stages = [
    { page: "offers", label: "Oferta", icon: FileText, row: offer, detail: record ? offer?.number : `${state.offers.length} dokumentów` },
    { page: "orders", label: "Realizacja", icon: Package, row: order, detail: record ? order?.number : `${state.orders.length} zamówień` },
    { page: "invoices", label: "Faktura", icon: ReceiptText, row: invoice, detail: record ? invoice?.number : `${state.invoices.length} faktur` },
    { page: "payments", label: "Płatność", icon: Wallet, row: invoice, detail: record ? invoice ? num(invoice.balance_gross) > 0 ? `${money(invoice.balance_gross)} do zapłaty` : "Rozliczona" : undefined : `${state.invoices.filter(row => num(row.balance_gross) > 0).length} do rozliczenia` },
  ];
  return <div className={`ops-document-trail ${record ? "is-detail" : ""}`} aria-label={record ? "Powiązane dokumenty" : "Obieg sprzedaży"}>{stages.map((stage, index) => {
    const current = stage.page === kind;
    const canOpen = !current && (!record || Boolean(stage.row)) && !(record && stage.page === "payments" && (num(invoice?.balance_gross) <= 0 || !onPayment));
    const content = <><span className="ops-trail-icon"><stage.icon size={18}/></span><span><strong>{stage.label}</strong><small>{stage.detail || "Kolejny krok"}</small></span>{index < 3 && <ChevronRight className="ops-trail-chevron" size={16}/>}</>;
    const targetName: Record<string, string> = { offers: "ofertę", orders: "zamówienie", invoices: "fakturę", payments: "należności" };
    return canOpen ? <button key={stage.page} type="button" title={stage.detail} aria-label={stage.page === "payments" && record ? "Zarejestruj płatność dla tej faktury" : `Otwórz ${targetName[stage.page]}${stage.row?.number ? ` ${stage.row.number}` : ""}`} onClick={() => { if (stage.page === "payments" && record && onPayment) onPayment(); else navigate(stage.page === "payments" ? "invoices" : stage.page, stage.page === "payments" ? "filter:__balance" : stage.row?.id); }}>{content}</button> : <div key={stage.page} className={current ? "is-current" : "is-pending"} title={stage.detail} aria-current={current ? "step" : undefined}>{content}</div>;
  })}</div>;
}

function RecordCard({ page, row, onOpen }: { page: string; row: Entity; onOpen: () => void }) {
  const document = page === "documents";
  const amount = page === "invoices" ? row.gross_total : page === "licenses" ? row.value_net : row.net_total;
  const primary = page === "licenses" ? row.product : document ? row.name : row.customer;
  const secondary = page === "offers" ? row.title : page === "licenses" ? row.customer : document ? row.customer : row.number;
  const deadline = page === "offers" ? row.valid_until : page === "invoices" ? row.due_date : page === "licenses" ? row.expires_at : page === "orders" ? row.delivery_date : row.date;
  return <button type="button" className="ops-record-card" onClick={onOpen} aria-label={`Otwórz ${row.number || row.name || row.product}`}>
    <span className="ops-record-card-top"><span className="ops-record-symbol">{page === "licenses" ? <BadgeCheck size={20}/> : document ? <FileText size={20}/> : page === "orders" ? <Package size={20}/> : <ReceiptText size={20}/>}</span><Status value={row.status}/><ArrowUpRight size={18}/></span>
    <small className="ops-record-number">{document ? row.category : row.number || "Umowa cykliczna"}</small><h3>{primary}</h3><p>{secondary}</p>
    <span className="ops-record-value">{document ? <><FileText size={18}/>{row.kind || "Dokument"}<small>{row.size}</small></> : <><strong>{money(amount)}</strong><small>{page === "invoices" ? "brutto" : "netto"}</small></>}</span>
    <span className="ops-record-card-bottom"><span><CalendarDays size={14}/>{dateLabel(deadline)}</span>{row.owner && <span><Avatar name={row.owner} small/>{String(row.owner).split(" ")[0]}</span>}</span>
  </button>;
}
function Info({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ops-info"><span>{label}</span><strong>{children || "—"}</strong></div>;
}
function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={`ops-notice ${warning ? "warning" : ""}`}>{warning ? <TriangleAlert size={18}/> : <ShieldCheck size={18}/>}<span>{children}</span></div>;
}
function Total({ row }: { row: Entity }) {
  return <div className="ops-total"><div><span>Wartość netto</span><b>{money(row.net_total)}</b></div><div><span>VAT</span><b>{money(row.vat_total)}</b></div><div className="ops-total-final"><span>Razem brutto</span><strong>{money(row.gross_total)}</strong></div></div>;
}
function ItemTable({ items = [] }: { items?: Entity[] }) {
  return <div className="ops-table-wrap"><table className="ops-table ops-items"><caption className="sr-only">Pozycje dokumentu handlowego</caption><thead><tr><th>Produkt lub usługa</th><th>Ilość</th><th>Cena netto</th><th>Rabat</th><th>VAT</th><th>Wartość netto</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id || index}><td><strong>{item.name}</strong><small>{item.unit || "szt."}</small></td><td>{num(item.quantity).toLocaleString("pl-PL")}</td><td>{money(item.price_net)}</td><td>{num(item.discount_pct)}%</td><td>{num(item.vat)}%</td><td><b>{money(item.net ?? num(item.quantity) * num(item.price_net) * (1 - num(item.discount_pct) / 100))}</b></td></tr>)}</tbody></table></div>;
}
function PdfPreview({ title, url, close }: { title: string; url: string; close: () => void }) {
  return <Modal title={title} eyebrow="PDF · Demo" onClose={close} wide footer={<><span className="ops-footer-note">Dokument DEMO · dane przykładowe</span><a className="button secondary" href={url} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/> Otwórz osobno</a><a className="button primary" href={url} download><Download size={16}/> Pobierz PDF</a></>}><div className="ops-pdf"><Suspense fallback={<div className="ops-pdf-loading">Ładowanie PDF…</div>}><DemoPdf title={title} url={url}/></Suspense></div></Modal>;
}
function documentUrl(kind: string, row: Entity) {
  return `/api/demo/documents/${kind}/${encodeURIComponent(row.id)}.pdf`;
}

function OfferEditor({ initial, product, license, state, save, close, onSaved }: {
  initial?: Entity; product?: Entity; license?: Entity; state: DemoState;
  save: (type: string, payload: Record<string, unknown>) => Promise<unknown>; close: () => void; onSaved: (id: string) => void;
}) {
  const editing = !!initial?.id;
  const firstProduct = product || state.products[0];
  const makeLine = (source?: Entity): DraftLine => ({
    key: crypto.randomUUID(), product_id: source?.id || "", name: source?.name || "",
    quantity: 1, unit: source?.unit || "szt.", price_net: num(source?.price_net), discount_pct: 0, vat: num(source?.vat ?? 23),
  });
  const [customerId, setCustomer] = useState(initial?.customer_id || license?.customer_id || state.customers[0]?.id || "");
  const [title, setTitle] = useState(initial?.title || (license ? `Odnowienie: ${license.product}` : product ? `Oferta: ${product.name}` : "Oferta współpracy"));
  const today = state.meta.date || "2026-11-03";
  const validDate = new Date(`${today}T12:00:00`); validDate.setDate(validDate.getDate() + 14);
  const [validUntil, setValidUntil] = useState(initial?.valid_until || validDate.toISOString().slice(0, 10));
  const [notes, setNotes] = useState(initial?.notes || "Termin realizacji i dostępność do potwierdzenia.");
  const [lines, setLines] = useState<DraftLine[]>(() => initial?.items?.length ? initial.items.map((item: Entity) => ({
    key: crypto.randomUUID(), product_id: item.product_id || "", name: item.name || "", quantity: num(item.quantity),
    unit: item.unit || "szt.", price_net: num(item.price_net), discount_pct: num(item.discount_pct), vat: num(item.vat),
  })) : license ? [{ ...makeLine(), name: `Odnowienie: ${license.product}`, product_id: "", quantity: num(license.seats) || 1, unit: "jedn.", price_net: rounded(num(license.value_net) / (num(license.seats) || 1)) }] : [makeLine(firstProduct)]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState(!initial?.needs_review);
  const totals = useMemo(() => lines.reduce((result, line) => {
    const net = rounded(line.quantity * line.price_net * (1 - line.discount_pct / 100));
    const vat = rounded(net * line.vat / 100);
    return { net_total: rounded(result.net_total + net), vat_total: rounded(result.vat_total + vat), gross_total: rounded(result.gross_total + net + vat) };
  }, { net_total: 0, vat_total: 0, gross_total: 0 }), [lines]);
  const update = (key: string, patch: Partial<DraftLine>) => setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));
  const choose = (key: string, id: string) => {
    const selected = state.products.find(row => row.id === id);
    if (selected) update(key, { product_id: id, name: selected.name, unit: selected.unit || "szt.", price_net: num(selected.price_net), vat: num(selected.vat ?? 23) });
    else update(key, { product_id: "", name: "", price_net: 0, unit: "szt." });
  };
  const submit = async () => {
    if (!reviewed) { setError("Potwierdź sprawdzenie proponowanych produktów, ilości, cen i stawek VAT."); return; }
    if (!customerId || !title.trim()) { setError("Wybierz klienta i wpisz tytuł oferty."); return; }
    if (!lines.length || lines.some(line => !line.name.trim() || line.quantity <= 0 || line.price_net < 0 || line.discount_pct < 0 || line.discount_pct > 100 || line.vat < 0 || line.vat > 100)) {
      setError("Sprawdź pozycje: nazwa, dodatnia ilość, cena netto i prawidłowy rabat są wymagane."); return;
    }
    if (!validUntil || validUntil < today) { setError("Termin ważności nie może być wcześniejszy od dzisiaj."); return; }
    setError(""); setSaving(true);
    try {
      const result = await save(editing ? "update_offer" : "create_offer", {
        ...(editing ? { id: initial!.id } : {}), customer_id: customerId, title: title.trim(), notes,
        valid_until: validUntil, items: lines.map(line => ({
          product_id: line.product_id, name: line.name, quantity: line.quantity, unit: line.unit,
          price_net: line.price_net, discount_pct: line.discount_pct, vat: line.vat,
        })),
      });
      if (result && typeof result === "object" && "id" in result && typeof result.id === "string") onSaved(result.id);
      else close();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Nie udało się zapisać oferty."); }
    finally { setSaving(false); }
  };
  return <Modal title={editing ? `Edytuj ${initial!.number}` : "Nowa oferta"} eyebrow="Ceny netto" onClose={close} wide footer={<><span className="ops-footer-note">Wszystkie ceny netto</span><Button onClick={close}>Anuluj</Button><Button variant="primary" busy={saving} disabled={!reviewed || !customerId || !title.trim()} onClick={() => void submit()}><Check size={16}/> Zapisz ofertę</Button></>}>
    {initial?.needs_review && <><Notice warning>Sprawdź propozycję: produkty, ilości, ceny i VAT.</Notice><label className="ops-review-confirm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/><span>Sprawdziłem pozycje i ceny.</span></label></>}
    <div className="ops-editor-top"><Field label="Klient"><select value={customerId} onChange={event => setCustomer(event.target.value)}>{state.customers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label="Ważna do"><input type="date" value={validUntil} onChange={event => setValidUntil(event.target.value)}/></Field><Field label="Tytuł oferty" className="ops-span-full"><input value={title} onChange={event => setTitle(event.target.value)} maxLength={200}/></Field></div>
    <div className="ops-section-title"><div><h3>Produkty i usługi</h3></div><Button onClick={() => setLines(current => [...current, makeLine()])}><Plus size={16}/> Dodaj pozycję</Button></div>
    <div className="ops-offer-lines">{lines.map((line, index) => <div className="ops-offer-line" key={line.key}><div className="ops-offer-line-heading"><span>{String(index + 1).padStart(2, "0")}</span><select title={line.name} aria-label={`Produkt pozycji ${index + 1}`} value={line.product_id} onChange={event => choose(line.key, event.target.value)}><option value="">Pozycja ręczna</option>{state.products.map(row => <option key={row.id} value={row.id}>{row.name} · {row.variant || row.sku}</option>)}</select><button className="icon-button" disabled={lines.length === 1} onClick={() => setLines(current => current.filter(item => item.key !== line.key))} aria-label={`Usuń pozycję ${index + 1}`}><Trash2 size={17}/></button></div><Field label="Nazwa pozycji"><input value={line.name} maxLength={250} onChange={event => update(line.key, { name: event.target.value })}/></Field><div className="ops-line-numbers"><Field label="Ilość"><input type="number" inputMode="decimal" min="0.01" step="0.01" value={line.quantity} onChange={event => update(line.key, { quantity: num(event.target.value) })}/></Field><Field label="Jednostka"><input value={line.unit} maxLength={20} onChange={event => update(line.key, { unit: event.target.value })}/></Field><Field label="Cena netto / jedn."><input type="number" inputMode="decimal" min="0" step="0.01" value={line.price_net} onChange={event => update(line.key, { price_net: num(event.target.value) })}/></Field><Field label="Rabat %"><input type="number" inputMode="decimal" min="0" max="100" step="0.1" value={line.discount_pct} onChange={event => update(line.key, { discount_pct: num(event.target.value) })}/></Field><Field label="VAT %"><select value={line.vat} onChange={event => update(line.key, { vat: num(event.target.value) })}>{[23, 8, 5, 0].map(rate => <option key={rate} value={rate}>{rate}%</option>)}</select></Field><div className="ops-line-total"><small>Wartość netto</small><b>{money(rounded(line.quantity * line.price_net * (1 - line.discount_pct / 100)))}</b></div></div></div>)}</div>
    <div className="ops-offer-bottom"><Field label="Warunki i uwagi"><textarea rows={4} value={notes} onChange={event => setNotes(event.target.value)} maxLength={4000}/></Field><Total row={{ id: "totals", ...totals }}/></div>
    {error && <div className="ops-form-error" role="alert">{error}</div>}
  </Modal>;
}

function ProductForm({ close, save, company }: { close: () => void; save: (type: string, payload: Record<string, unknown>) => Promise<unknown>; company: string }) {
  const [name, setName] = useState(""); const [category, setCategory] = useState("service");
  const [price, setPrice] = useState("1200"); const [cost, setCost] = useState("800"); const [sku, setSku] = useState(() => `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
  const [producer, setProducer] = useState(company); const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async () => {
    if (!name.trim() || !sku.trim() || num(price) < 0 || num(cost) < 0) { setError("Uzupełnij nazwę, SKU i poprawne ceny."); return; }
    setSaving(true); setError("");
    try { await save("create_product", { name, category, sku, producer, variant: "Standard", unit: category === "service" ? "usł." : "szt.", price_net: num(price), cost_net: num(cost), vat: 23, stock: category === "hardware" ? 10 : 0, description }); close(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Nie udało się dodać produktu."); } finally { setSaving(false); }
  };
  return <Modal title="Nowa pozycja katalogu" onClose={close} footer={<><Button onClick={close}>Anuluj</Button><Button variant="primary" busy={saving} disabled={!name.trim() || !sku.trim()} onClick={() => void submit()}>Dodaj do katalogu</Button></>}><div className="ops-form-grid"><Field label="Nazwa" className="ops-span-full"><input value={name} onChange={event => setName(event.target.value)} maxLength={200}/></Field><Field label="SKU"><input value={sku} onChange={event => setSku(event.target.value)} maxLength={60}/></Field><Field label="Kategoria"><select value={category} onChange={event => setCategory(event.target.value)}><option value="service">Usługa</option><option value="license">Umowa cykliczna</option><option value="hardware">Produkt</option></select></Field><Field label="Dostawca / marka"><input value={producer} onChange={event => setProducer(event.target.value)} maxLength={120}/></Field><Field label="Cena netto"><input type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)}/></Field><Field label="Koszt netto"><input type="number" min="0" step="0.01" value={cost} onChange={event => setCost(event.target.value)}/></Field><Field label="Opis" className="ops-span-full"><textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} maxLength={1500}/></Field></div>{error && <div role="alert" className="ops-form-error">{error}</div>}</Modal>;
}

const PAGE_META: Record<string, { title: string; hint: string }> = {
  offers: { title: "Oferty", hint: "Pozycje, warunki i PDF" },
  orders: { title: "Zamówienia", hint: "Od akceptacji do realizacji" },
  invoices: { title: "Faktury", hint: "Dokumenty i rozliczenia" },
  products: { title: "Katalog", hint: "Produkty, usługi i ceny netto" },
  licenses: { title: "Umowy i odnowienia", hint: "Stała współpraca i terminy" },
  documents: { title: "Dokumenty", hint: "Pliki i wiedza zespołu" },
  projects: { title: "Projekty", hint: "Zadania, terminy i budżety" },
  reports: { title: "Raporty", hint: "Wyniki i dane źródłowe" },
};

export function Operations(props: Props) {
  return <OperationsWorkspace key={`${props.page}:${props.selectedId || ""}`} {...props}/>;
}

function OperationsWorkspace({ page, state, act, navigate, notify, selectedId }: Props) {
  const readOnly = state.meta.role === "viewer";
  const [query, storeQuery] = useState(""); const [filter, storeFilter] = useState(() => selectedId?.startsWith("filter:") ? selectedId.slice(7) : "");
  const [pageIndex, setPageIndex] = useState(1);
  const [sort, setSort] = useState(page === "licenses" ? "deadline" : "recent");
  const [view, setView] = useState<"list" | "cards">(() => { try { const saved=localStorage.getItem(`all-day-erp-view-${page}`);return saved === "cards" || saved === "list" ? saved : page === "offers" ? "cards" : "list"; } catch { return page === "offers" ? "cards" : "list"; } });
  const [activeMetric, setActiveMetric] = useState(() => selectedId?.startsWith("filter:") ? ({__balance:"balance",__received:"received",__open:"open",overdue:"overdue",sent:"sent",accepted:"accepted",processing:"processing",completed:"completed"} as Record<string,string>)[selectedId.slice(7)] || "" : "all");
  const setQuery = (value: string) => { storeQuery(value); setPageIndex(1); };
  const setFilter = (value: string) => { storeFilter(value); setActiveMetric(""); setPageIndex(1); };
  const metricFilter = (value: string, metric: string) => { storeFilter(value); setActiveMetric(metric); setPageIndex(1); };
  const changeView = (value: "list" | "cards") => { setView(value); try { localStorage.setItem(`all-day-erp-view-${page}`, value); } catch { /* The selected view also works without storage. */ } };
  const [selected, setSelected] = useState<Selected>(() => selectedId && selectedId !== "new" && !selectedId.startsWith("new-") && !selectedId.startsWith("filter:") ? { kind: page, id: selectedId } : null);
  const [editor, setEditor] = useState<OfferEditorState>(() => {
    if (readOnly || page !== "offers" || !selectedId) return null;
    if (selectedId === "new") return {};
    if (selectedId.startsWith("new-calculation:")) {
      const parts = selectedId.split(":");
      if (parts.length !== 5 || parts.slice(2).some(value => !value.trim() || !Number.isFinite(Number(value)))) return null;
      const [, productId, quantityText, priceText, discountText] = parts;
      const quantity = Number(quantityText), priceNet = Number(priceText), discount = Number(discountText);
      if (quantity <= 0 || quantity > 1_000_000 || priceNet < 0 || priceNet > 1_000_000_000 || discount < 0 || discount > 100) return null;
      const product = state.products.find(row => row.id === productId);
      if (!product && productId !== "custom") return null;
      return { initial: { id: "", title: "Nowa oferta", items: [{
        product_id: product?.id || "", name: product?.name || "Własna pozycja", unit: product?.unit || "szt.",
        quantity, price_net: priceNet, discount_pct: discount, vat: num(product?.vat ?? 23),
      }] } };
    }
    if (selectedId.startsWith("new-customer:")) {
      const customer = state.customers.find(row => row.id === selectedId.slice("new-customer:".length));
      if (customer) return { initial: { id: "", customer_id: customer.id, title: `Oferta dla ${customer.name}` } };
    }
    if (selectedId.startsWith("new-tender:")) {
      const tender = (state.tenders || []).find((row: Entity) => row.id === selectedId.slice("new-tender:".length));
      if (!tender) return null;
      const customer = state.customers.find(row => row.id === tender.customer_id || row.name === tender.organization);
      const proposed = tender.offer_items?.length ? tender.offer_items : [
        { product_id: "p1", quantity: 20 }, { product_id: "p3", quantity: 10 }, { product_id: "p6", quantity: 1 },
      ];
      const items = proposed.flatMap((item: Entity) => {
        const product = state.products.find(row => row.id === item.product_id);
        return product ? [{ id: product.id, product_id: product.id, name: product.name, quantity: num(item.quantity) || 1, unit: product.unit, price_net: product.price_net, vat: product.vat, discount_pct: 0 }] : [];
      });
      return { initial: { id: "", customer_id: customer?.id || state.customers[0]?.id, title: `Oferta: ${tender.title}`, items, needs_review: true,
        notes: `Propozycja demonstracyjna do: ${tender.title}. ${tender.needs_summary || tender.requirements?.join("; ") || "Zakres wymaga sprawdzenia."}\nWymagana kontrola produktów, ilości, cen i warunków przed wydaniem dokumentu.` } };
    }
    return null;
  });
  const [productForm, setProductForm] = useState(false);
  const [deleteOffer, setDeleteOffer] = useState<Entity | null>(null);
  const [pdf, setPdf] = useState<{ title: string; url: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [payment, setPayment] = useState<Entity | null>(null); const [paymentAmount, setPaymentAmount] = useState("");
  const [projectEdit, setProjectEdit] = useState<Entity | null>(null); const [projectProgress, setProjectProgress] = useState(0); const [projectStatus, setProjectStatus] = useState("active");
  const [analysis, setAnalysis] = useState<{ id: string; data: Entity } | null>(null);
  const [reportPeriod, setReportPeriod] = useState("6");
  const [reportMetric, setReportMetric] = useState("revenue");
  const rows: Entity[] = useMemo(() => page === "reports" ? [] : state[page] || [], [page, state]);
  const meta = PAGE_META[page] || PAGE_META.offers;
  const matching = useMemo(() => rows.filter(row => (!query || includes(row, query, ["name", "title", "number", "customer", "product", "producer", "sku", "owner", "category"])) && (!filter || matchesScope(row, filter))).sort((a, b) => {
    if (sort === "value") return num(b.net_total ?? b.value_net ?? b.price_net ?? b.budget_net) - num(a.net_total ?? a.value_net ?? a.price_net ?? a.budget_net);
    if (sort === "name") return String(a.customer || a.name || a.product || a.number).localeCompare(String(b.customer || b.name || b.product || b.number), "pl");
    const date = (row: Entity) => Date.parse(String(sort === "deadline" ? row.expires_at || row.due_date || row.delivery_date || row.deadline || row.valid_until || row.date || "" : row.date || row.starts_at || row.deadline || "")) || 0;
    return sort === "deadline" ? date(a) - date(b) : date(b) - date(a);
  }), [rows, query, filter, sort]);
  const pageSize = page === "products" ? 12 : page === "projects" ? 6 : 15;
  const pagesCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const activePage = Math.min(pageIndex, pagesCount);
  const filtered = matching.slice((activePage - 1) * pageSize, activePage * pageSize);
  const chosen = selected ? ((state[selected.kind] || []) as Entity[]).find(row => row.id === selected.id) : null;
  const linkedOrder = chosen && selected?.kind === "offers" ? state.orders.find(row => row.offer_id === chosen.id) : null;
  const linkedInvoice = chosen && selected?.kind === "orders" ? state.invoices.find(row => row.order_id === chosen.id) : null;
  const save = async (type: string, payload: Record<string, unknown> = {}) => {
    if (readOnly) throw new Error("Tryb tylko do odczytu. Zmiana danych jest niedostępna.");
    const result = await act(type, payload);
    if (type.startsWith("create_")) { setQuery(""); setFilter(""); }
    return result;
  };
  const run = async (type: string, payload: Record<string, unknown> = {}, done?: (result: Entity) => void) => {
    if (readOnly) { notify("Tryb tylko do odczytu. Zmiana danych jest niedostępna.", "info"); return; }
    if (busy) return;
    setBusy(`${type}:${String(payload.id || "")}`);
    try { const result = await save(type, payload); done?.(result?.result || result); }
    catch (problem) { notify(problem instanceof Error ? problem.message : "Operacja nie powiodła się.", "error"); }
    finally { setBusy(""); }
  };
  const showPdf = (kind: string, row: Entity) => setPdf({ title: row.number || row.name || row.title, url: documentUrl(kind, row) });
  const closeDetails = () => { setSelected(null); if (selectedId) navigate(page); };
  const closeEditor = () => {
    if (editor?.initial?.id) setSelected({ kind: "offers", id: editor.initial.id });
    else if (editor?.product?.id) setSelected({ kind: "products", id: editor.product.id });
    else if (editor?.license?.id) setSelected({ kind: "licenses", id: editor.license.id });
    setEditor(null);
    if (selectedId === "new" || selectedId?.startsWith("new-")) navigate("offers");
  };
  const open = (row: Entity) => setSelected({ kind: page, id: row.id });
  const reportRows = state.revenue_series.slice(-num(reportPeriod));
  const showCount = `Wyniki: ${matching.length}`;
  const exportReports = () => {
    const csv = "\uFEFFMiesiąc;Przychód netto;Koszt netto;Wynik na sprzedaży;Cel\r\n" + reportRows.map(row => [String(row.month).replace(/^[=+@-]/, "'"), row.revenue, row.cost, row.profit ?? num(row.revenue) - num(row.cost), row.goal].map(value => String(value ?? "").replace(/;/g, ",")).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = "All_Day_IT_raport_demonstracyjny.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Pobrano raport z fikcyjnymi danymi demonstracyjnymi.", "success");
  };
  return <div className={`ops-page ops-page-${page}`}>
    {page === "reports" && <details className="ops-model-note"><summary>Jak liczymy wyniki?</summary><p>{state.meta.financial_model || "Przykładowy model wyników. Pełne wartości są w tabeli źródłowej."}</p></details>}
    <header className="ops-page-header"><div className="ops-title-block"><span className="ops-module-icon">{page === "offers" ? <FileText size={25}/> : page === "orders" ? <Package size={25}/> : page === "invoices" ? <ReceiptText size={25}/> : page === "products" ? <Layers3 size={25}/> : page === "projects" ? <FolderKanban size={25}/> : page === "licenses" ? <BadgeCheck size={25}/> : page === "reports" ? <TrendingUp size={25}/> : <FileSearch size={25}/>}</span><div><h1>{meta.title}</h1><p>{meta.hint}</p></div></div><div className="ops-header-actions">{page === "offers" && <Button variant="primary" onClick={() => setEditor({})} disabled={readOnly}><Plus size={18}/> Nowa oferta</Button>}{page === "products" && <Button variant="primary" onClick={() => setProductForm(true)} disabled={readOnly}><Plus size={18}/> Dodaj produkt</Button>}{page === "reports" && <Button onClick={exportReports}><ArrowDownToLine size={17}/> Eksport CSV</Button>}{page === "projects" && <Button disabled={readOnly} onClick={() => navigate("calendar")}><CalendarDays size={17}/> Zaplanuj aktywność</Button>}</div></header>
    {readOnly && <Notice>Tryb tylko do odczytu. Przeglądaj dane i pobieraj dokumenty.</Notice>}
    {["offers", "orders", "invoices"].includes(page) && <DocumentTrail state={state} navigate={navigate} kind={page}/>}
    {page === "offers" && <div className="ops-metrics"><Metric label="Wartość ofert netto" onClick={() => metricFilter("", "all")} active={activeMetric === "all"} value={money(sum(state.offers, "net_total"), true)} detail={`${state.offers.length} ofert`} icon={<FileText size={20}/>}/><Metric label="Wysłane" onClick={() => metricFilter("sent", "sent")} active={activeMetric === "sent"} value={state.offers.filter(row => row.status === "sent").length} detail="Do decyzji" icon={<FileClock size={20}/>} tone="violet"/><Metric label="Zaakceptowane" onClick={() => metricFilter("accepted", "accepted")} active={activeMetric === "accepted"} value={state.offers.filter(row => row.status === "accepted").length} detail="Gotowe do realizacji" icon={<BadgeCheck size={20}/>} tone="green"/><Metric label="Zaakceptowane netto" onClick={() => metricFilter("accepted", "accepted-net")} active={activeMetric === "accepted-net"} value={money(sum(state.offers.filter(row => row.status === "accepted"), "net_total"), true)} detail="Kwoty przykładowe, netto" icon={<TrendingUp size={20}/>} tone="cyan"/></div>}
    {page === "orders" && <div className="ops-metrics"><Metric label="Wartość zamówień netto" onClick={() => metricFilter("", "all")} active={activeMetric === "all"} value={money(sum(state.orders, "net_total"), true)} detail={`${state.orders.length} powiązanych zamówień`} icon={<Package size={20}/>}/><Metric label="W realizacji" onClick={() => metricFilter("processing", "processing")} active={activeMetric === "processing"} value={state.orders.filter(row => row.status === "processing").length} detail="Otwarte zamówienia" icon={<RefreshCw size={20}/>} tone="violet"/><Metric label="Zrealizowane" onClick={() => metricFilter("completed", "completed")} active={activeMetric === "completed"} value={state.orders.filter(row => row.status === "completed").length} detail="Zrealizowane zamówienia" icon={<CheckCircle2 size={20}/>} tone="green"/><Metric label="Pozycje do obsługi" onClick={() => metricFilter("__open", "open")} active={activeMetric === "open"} value={state.orders.filter(row => row.status !== "completed").reduce((n, row) => n + (row.items?.length || 0), 0)} detail="W trakcie obsługi" icon={<Layers3 size={20}/>} tone="cyan"/></div>}
    {page === "invoices" && <><div className="ops-metrics"><Metric label="Wystawione brutto" onClick={() => metricFilter("", "all")} active={activeMetric === "all"} value={money(sum(state.invoices, "gross_total"), true)} detail={`${state.invoices.length} dokumentów`} icon={<ReceiptText size={20}/>}/><Metric label="Otrzymane wpłaty" onClick={() => metricFilter("__received", "received")} active={activeMetric === "received"} value={money(sum(state.invoices, "paid_gross"), true)} detail="Wpłaty zarejestrowane" icon={<Wallet size={20}/>} tone="green"/><Metric label="Pozostałe należności" onClick={() => metricFilter("__balance", "balance")} active={activeMetric === "balance"} value={money(sum(state.invoices, "balance_gross"), true)} detail="Do rozliczenia" icon={<CreditCard size={20}/>} tone="violet"/><Metric label="Saldo po terminie" onClick={() => metricFilter("overdue", "overdue")} active={activeMetric === "overdue"} value={money(sum(state.invoices.filter(row => row.status === "overdue"), "balance_gross"), true)} detail={`${state.invoices.filter(row => row.status === "overdue").length} do sprawdzenia`} icon={<FileClock size={20}/>} tone="orange"/></div></>}
    {page === "products" && <div className="ops-metrics"><Metric label="Produkty i usługi" onClick={() => metricFilter("", "all")} active={activeMetric === "all"} value={state.products.length} detail="Pozycje katalogu" icon={<Package size={20}/>}/><Metric label="Umowy cykliczne" onClick={() => metricFilter("license", "license")} active={activeMetric === "license"} value={state.products.filter(row => row.category === "license").length} detail="Cykliczna współpraca" icon={<BadgeCheck size={20}/>} tone="violet"/><Metric label="Usługi" onClick={() => metricFilter("service", "service")} active={activeMetric === "service"} value={state.products.filter(row => row.category === "service").length} detail="Zakresy do wyceny" icon={<Layers3 size={20}/>} tone="cyan"/><Metric label="Produkty fizyczne" onClick={() => metricFilter("hardware", "hardware")} active={activeMetric === "hardware"} value={state.products.filter(row => row.category === "hardware").length} detail="Pozycje dostępne w katalogu" icon={<Building2 size={20}/>} tone="green"/></div>}
    {page === "licenses" && <div className="ops-metrics"><Metric label="Aktywne umowy" onClick={() => metricFilter("__active", "active")} active={activeMetric === "active"} value={state.licenses.filter(row => row.status !== "expired").length} detail="Powiązane z klientami" icon={<BadgeCheck size={20}/>}/><Metric label="Odnowienie do 90 dni" onClick={() => metricFilter("__expiring", "expiring")} active={activeMetric === "expiring"} value={state.licenses.filter(row => num(row.days_remaining) >= 0 && num(row.days_remaining) <= 90).length} detail="Nadchodzące terminy" icon={<CalendarDays size={20}/>} tone="orange"/><Metric label="Jednostki" onClick={() => metricFilter("", "units")} active={activeMetric === "units"} value={sum(state.licenses, "seats")} detail="Łączna liczba jednostek" icon={<Layers3 size={20}/>} tone="violet"/><Metric label="Wartość roczna netto" onClick={() => metricFilter("", "annual")} active={activeMetric === "annual"} value={money(sum(state.licenses, "value_net"), true)} detail="" icon={<TrendingUp size={20}/>} tone="green"/></div>}
    {page === "documents" && <div className="ops-metrics"><Metric label="Dokumenty" onClick={() => metricFilter("", "all")} active={activeMetric === "all"} value={state.documents.length} detail="Powiązane z kontekstem biznesowym" icon={<FileText size={20}/>}/><Metric label="Umowy" onClick={() => metricFilter("__agreements", "agreements")} active={activeMetric === "agreements"} value={state.documents.filter(row => lower(row.category).includes("umow")).length} detail="Dokumenty z kategorii umów" icon={<Tag size={20}/>} tone="violet"/><Metric label="Gotowe do analizy" onClick={() => metricFilter("__analysable", "analysable")} active={activeMetric === "analysable"} value={state.documents.filter(row => row.source_text).length} detail="Przykładowe źródła tekstowe" icon={<Sparkles size={20}/>} tone="cyan"/><Metric label="Po analizie" onClick={() => metricFilter("__analysed", "analysed")} active={activeMetric === "analysed"} value={state.documents.filter(row => row.analysis || row.status === "analyzed").length} detail="Zapisane wyniki Copilota" icon={<ShieldCheck size={20}/>} tone="green"/></div>}
    {page === "projects" && <div className="ops-metrics"><Metric label="Projekty" onClick={() => metricFilter("", "all")} active={activeMetric === "all"} value={state.projects.length} detail="Wspólny widok realizacji" icon={<FolderKanban size={20}/>}/><Metric label="Średni postęp" onClick={() => metricFilter("__inprogress", "progress")} active={activeMetric === "progress"} value={`${Math.round(sum(state.projects, "progress") / Math.max(1, state.projects.length))}%`} detail="W całym zespole" icon={<TrendingUp size={20}/>} tone="cyan"/><Metric label="Budżet netto" onClick={() => metricFilter("", "budget")} active={activeMetric === "budget"} value={money(sum(state.projects, "budget_net"), true)} detail="Plan realizacji" icon={<Wallet size={20}/>} tone="violet"/><Metric label="Wykorzystane netto" onClick={() => metricFilter("__inprogress", "spent")} active={activeMetric === "spent"} value={money(sum(state.projects, "spent_net"), true)} detail="Bieżące koszty projektów" icon={<CreditCard size={20}/>} tone="green"/></div>}
    {page !== "reports" && <Panel className="ops-list-panel"><div className="ops-toolbar"><label className="ops-search"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={page === "products" ? "Nazwa, SKU, dostawca…" : page === "licenses" ? "Klient, produkt, opiekun…" : "Numer, klient lub nazwa…"} aria-label={`Szukaj w sekcji ${meta.title}`}/>{query && <button aria-label="Wyczyść wyszukiwanie" onClick={() => setQuery("")}><X size={15}/></button>}</label><select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filtruj wyniki"><option value="">{page === "products" ? "Wszystkie kategorie" : "Wszystkie statusy"}</option>{scopeNames[filter] && <option value={filter}>{scopeNames[filter]}</option>}{Array.from(new Set(rows.map(row => String(page === "products" ? row.category : row.status || row.kind || "")))).filter(Boolean).map(value => <option value={value} key={value}>{page === "products" ? ({ license: "Umowy cykliczne", service: "Usługi", hardware: "Produkty" }[value] || value) : statusNames[value] || value}</option>)}</select><select className="ops-sort" aria-label="Sortowanie wyników" value={sort} onChange={event => {setSort(event.target.value); setPageIndex(1);}}><option value="recent">Najnowsze</option><option value="deadline">Najbliższy termin</option><option value="value">Wartość malejąco</option><option value="name">Nazwa A-Z</option></select><span className="ops-record-count">{showCount}</span>{!["products", "projects"].includes(page) && <div className="ops-view-switch" aria-label="Układ wyników"><button type="button" aria-label="Widok kart" aria-pressed={view === "cards"} onClick={() => changeView("cards")}><Grid2X2 size={17}/></button><button type="button" aria-label="Widok listy" aria-pressed={view === "list"} onClick={() => changeView("list")}><List size={18}/></button></div>}</div>{(filter || query) && <div className="ops-active-filter"><span><CheckCircle2 size={15}/>{filter ? scopeNames[filter] || statusNames[filter] || ({license:"Umowy cykliczne",service:"Usługi",hardware:"Produkty fizyczne"}[filter] || filter) : `Szukasz: ${query}`}</span><button type="button" onClick={() => {setQuery("");setFilter("");setActiveMetric("all");}}><X size={14}/> Wyczyść</button></div>}
      {!filtered.length ? <Empty action={query || filter ? <Button onClick={() => { setQuery(""); setFilter(""); }}>Wyczyść filtry</Button> : undefined}/> : page === "products" ? <div className="ops-product-grid">{filtered.map(row => <button className="ops-product-card" key={row.id} onClick={() => open(row)}><div className="ops-product-head"><span className={`ops-product-icon ${row.category}`} >{row.category === "license" ? <BadgeCheck size={25}/> : row.category === "service" ? <Layers3 size={25}/> : <Package size={25}/>}</span><Badge>{({ license: "Umowa cykliczna", service: "Usługa", hardware: "Produkt" }[String(row.category)] || row.category)}</Badge></div><small>{row.producer} · {row.sku}</small><h3>{row.name}</h3><p>{row.variant || row.description}</p><div className="ops-product-foot"><span><strong>{money(row.price_net)}</strong><small>netto / {row.unit || "szt."}</small></span><span className="ops-product-arrow"><ArrowUpRight size={19}/></span></div></button>)}</div> : page === "projects" ? <div className="ops-project-grid">{filtered.map(row => <button className="ops-project-card" key={row.id} onClick={() => open(row)}><div className="ops-card-kicker"><span><FolderKanban size={18}/> PROJEKT</span><Status value={row.status}/></div><h3>{row.name}</h3><p>{row.customer}</p><div className="ops-progress-label"><span>Postęp realizacji</span><b>{num(row.progress)}%</b></div><div className="ops-progress"><span style={{ width: `${Math.min(100, Math.max(0, num(row.progress)))}%` }}/></div><div className="ops-project-stats"><span><small>Budżet netto</small><b>{money(row.budget_net, true)}</b></span><span><small>Termin</small><b>{dateLabel(row.deadline)}</b></span></div><div className="ops-project-footer"><span><Avatar name={row.owner} small/>{row.owner}</span><span>{(row.tasks || []).filter((task: Entity) => task.status === "done").length}/{(row.tasks || []).length} zadań <ChevronRight size={15}/></span></div></button>)}</div> : view === "cards" ? <div className="ops-record-grid">{filtered.map(row => <RecordCard key={row.id} page={page} row={row} onOpen={() => open(row)}/>)}</div> : <div className="ops-table-wrap"><table className="ops-table"><caption className="sr-only">{meta.title}</caption><thead><tr>{page === "offers" ? <><th>Oferta / klient</th><th>Status</th><th>Wartość netto</th><th>Ważna do</th><th>Opiekun</th></> : page === "orders" ? <><th>Zamówienie / klient</th><th>Status</th><th>Wartość netto</th><th>Realizacja</th><th>Pozycje</th></> : page === "invoices" ? <><th>Faktura / klient</th><th>Status</th><th>Brutto</th><th>Pozostało</th><th>Termin płatności</th><th>KSeF</th></> : page === "licenses" ? <><th>Umowa / klient</th><th>Status</th><th>Jednostki</th><th>Odnowienie</th><th>Wartość netto</th><th>Opiekun</th></> : <><th>Dokument</th><th>Kategoria</th><th>Klient</th><th>Data</th><th>Właściciel</th></>}<th><span className="sr-only">Szczegóły</span></th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><button className="ops-row-link" onClick={() => open(row)}><span className="ops-row-icon">{page === "licenses" ? <BadgeCheck size={18}/> : page === "documents" ? <FileText size={18}/> : page === "orders" ? <Package size={18}/> : <ReceiptText size={18}/>}</span><span><strong>{row.number || row.name || row.product}</strong><small>{page === "documents" ? row.size || row.kind : row.customer}</small>{page === "offers" && <em>{row.title}</em>}</span></button></td>{page === "offers" ? <><td><Status value={row.status}/></td><td><strong>{money(row.net_total)}</strong><small>{row.items?.length || 0} poz.</small></td><td>{dateLabel(row.valid_until)}</td><td><span className="ops-owner"><Avatar name={row.owner} small/>{row.owner}</span></td></> : page === "orders" ? <><td><Status value={row.status}/></td><td><strong>{money(row.net_total)}</strong></td><td>{dateLabel(row.delivery_date)}</td><td>{row.items?.length || 0}</td></> : page === "invoices" ? <><td><Status value={row.status}/></td><td><strong>{money(row.gross_total)}</strong></td><td className={num(row.balance_gross) > 0 ? "ops-balance" : "ops-paid"}><strong>{money(row.balance_gross)}</strong></td><td>{dateLabel(row.due_date)}</td><td>{row.ksef_status === "accepted_demo" ? <Badge tone="good"><Check size={12}/> DEMO</Badge> : <span className="ops-muted">Nieprzesłana</span>}</td></> : page === "licenses" ? <><td><Status value={row.status}/></td><td>{row.seats}</td><td><strong>{dateLabel(row.expires_at)}</strong><small className={num(row.days_remaining) < 30 ? "ops-urgent" : ""}>{num(row.days_remaining) < 0 ? `${Math.abs(num(row.days_remaining))} dni po terminie` : `za ${num(row.days_remaining)} dni`}</small></td><td>{money(row.value_net)}</td><td>{row.owner}</td></> : <><td><Badge>{row.category}</Badge></td><td>{row.customer}</td><td>{dateLabel(row.date)}</td><td>{row.owner}</td></>}<td><button className="icon-button" aria-label={`Otwórz ${row.number || row.name || row.product}`} onClick={() => open(row)}><ChevronRight size={18}/></button></td></tr>)}</tbody></table></div>}
      <div className="ops-list-footer"><span>{matching.length ? `${(activePage - 1) * pageSize + 1}–${Math.min(activePage * pageSize, matching.length)} z ${matching.length}` : "0 rekordów"}</span><div className="ops-pagination"><Button disabled={activePage <= 1} onClick={() => setPageIndex(activePage - 1)} aria-label="Poprzednia strona">‹</Button><span>Strona {activePage} z {pagesCount}</span><Button disabled={activePage >= pagesCount} onClick={() => setPageIndex(activePage + 1)} aria-label="Następna strona">›</Button></div></div></Panel>}

    {page === "reports" && <><div className="ops-metrics"><Metric label="Przychód netto" onClick={() => setReportMetric("revenue")} active={reportMetric === "revenue"} value={money(sum(reportRows, "revenue"), true)} detail={`Suma ${reportRows.length} widocznych miesięcy`} icon={<TrendingUp size={20}/>}/><Metric label="Wynik netto na sprzedaży" onClick={() => setReportMetric("profit")} active={reportMetric === "profit"} value={money(sum(reportRows, "profit"), true)} detail="Przychód minus koszt" icon={<Wallet size={20}/>} tone="green"/><Metric label="Marża sprzedaży" onClick={() => setReportMetric("margin")} active={reportMetric === "margin"} value={`${(sum(reportRows, "profit") / Math.max(1, sum(reportRows, "revenue")) * 100).toFixed(1).replace(".", ",")}%`} detail="Wynik / przychód" icon={<Layers3 size={20}/>} tone="violet"/><Metric label="Otwarte należności brutto" onClick={() => navigate("invoices", "filter:__balance")} value={money(sum(state.invoices, "balance_gross"), true)} detail="Bieżące saldo dokumentów" icon={<CreditCard size={20}/>} tone="orange"/></div><Panel className="ops-report-chart"><div className="ops-report-heading"><div><h2>Sprzedaż w czasie</h2></div><div className="ops-report-controls"><select aria-label="Wskaźnik raportu" value={reportMetric} onChange={event => setReportMetric(event.target.value)}><option value="revenue">Przychód netto</option><option value="profit">Wynik na sprzedaży</option><option value="cost">Koszt sprzedaży</option><option value="margin">Marża sprzedaży (%)</option></select><select aria-label="Okres raportu" value={reportPeriod} onChange={event => setReportPeriod(event.target.value)}><option value="3">3 miesiące</option><option value="6">6 miesięcy</option><option value="12">12 miesięcy</option></select></div></div><RevenueChart rows={reportRows} metric={reportMetric}/><div className="ops-chart-legend"><span><i/> {reportMetric === "revenue" ? "Przychód netto" : reportMetric === "profit" ? "Wynik na sprzedaży" : reportMetric === "margin" ? "Marża sprzedaży" : "Koszt sprzedaży"}</span>{reportMetric === "revenue" && <span><i className="target"/> Cel przychodu</span>}</div></Panel><div className="ops-report-bottom"><Panel className="ops-report-summary"><div className="ops-section-title"><div><h3>Proces handlowy</h3><p>Od oferty do realizacji</p></div><Button variant="ghost" onClick={() => navigate("offers")}>Oferty <ArrowRight size={15}/></Button></div>{[{ label: "Przygotowane oferty", count: state.offers.length, total: state.offers.length, color: "blue" }, { label: "Zaakceptowane oferty", count: state.offers.filter(row => row.status === "accepted").length, total: state.offers.length, color: "cyan" }, { label: "Zamówienia", count: state.orders.length, total: Math.max(state.orders.length, state.offers.length), color: "violet" }, { label: "Opłacone faktury", count: state.invoices.filter(row => row.status === "paid").length, total: state.invoices.length, color: "green" }].map(item => <div className="ops-funnel-row" key={item.label}><div><span>{item.label}</span><b>{item.count}</b></div><div className={`ops-funnel-bar ${item.color}`}><span style={{ width: `${item.count / Math.max(1, item.total) * 100}%` }}/></div></div>)}</Panel><Panel className="ops-report-summary"><div className="ops-section-title"><div><h3>Najbliższe odnowienia</h3></div><Button variant="ghost" onClick={() => navigate("licenses")}>Umowy <ArrowRight size={15}/></Button></div>{[...state.licenses].sort((a, b) => num(a.days_remaining) - num(b.days_remaining)).slice(0, 5).map(row => <button key={row.id} className="ops-renewal-row" onClick={() => navigate("licenses", row.id)}><span className="ops-row-icon"><BadgeCheck size={17}/></span><span><strong>{row.customer}</strong><small>{row.product} · {row.seats} jedn.</small></span><span><b>{money(row.value_net, true)}</b><small>{dateLabel(row.expires_at)}</small></span><ChevronRight size={16}/></button>)}</Panel></div><Panel className="ops-report-data"><div className="ops-section-title"><div><h3>Dane źródłowe wykresu</h3></div><Button onClick={exportReports}><Download size={16}/> CSV</Button></div><div className="ops-table-wrap"><table className="ops-table"><caption className="sr-only">Miesięczne wyniki fikcyjnej firmy</caption><thead><tr><th>Miesiąc</th><th>Przychód netto</th><th>Koszt sprzedaży</th><th>Wynik na sprzedaży</th><th>Cel</th><th>Realizacja celu</th></tr></thead><tbody>{reportRows.map(row => <tr key={row.id || row.month}><td><strong>{row.month}</strong></td><td>{money(row.revenue)}</td><td>{money(row.cost)}</td><td className="ops-paid">{money(row.profit)}</td><td>{money(row.goal)}</td><td>{Math.round(num(row.revenue) / Math.max(1, num(row.goal)) * 100)}%</td></tr>)}</tbody></table></div></Panel></>}

    {chosen && selected && <Modal title={chosen.number || chosen.name || chosen.product} eyebrow={`${selected.kind === "offers" ? "OFERTA" : selected.kind === "invoices" ? "FAKTURA DEMO" : selected.kind === "orders" ? "ZAMÓWIENIE" : selected.kind === "licenses" ? "UMOWA" : selected.kind === "products" ? "KARTA PRODUKTU" : selected.kind === "projects" ? "PROJEKT" : "DOKUMENT"} · ${state.meta.company}`} wide={!["licenses", "products"].includes(selected.kind)} onClose={closeDetails} footer={<><Button onClick={closeDetails}>Zamknij</Button></>}>
      {["offers", "orders", "invoices"].includes(selected.kind) && <DocumentTrail state={state} navigate={navigate} kind={selected.kind} record={chosen} onPayment={readOnly ? undefined : () => { const invoice = selected.kind === "invoices" ? chosen : state.invoices.find(row => row.order_id === (selected.kind === "orders" ? chosen.id : linkedOrder?.id)); if (invoice) {setPayment(invoice);setPaymentAmount(String(invoice.balance_gross));} }}/>}
      {selected.kind === "offers" && <><div className="ops-detail-heading"><div><h3>{chosen.title}</h3><p>{chosen.customer}</p></div><Status value={chosen.status}/></div><div className="ops-detail-actions"><Button variant="primary" onClick={() => showPdf("offer", chosen)}><FileText size={16}/> Podgląd PDF</Button><Button onClick={() => { setEditor({ initial: chosen }); setSelected(null); }} disabled={readOnly}><Pencil size={16}/> Edytuj</Button><Button busy={busy.startsWith("duplicate_offer")} onClick={() => void run("duplicate_offer", { id: chosen.id }, result => navigate("offers", result.id))} disabled={readOnly}><Copy size={16}/> Duplikuj</Button>{chosen.status === "draft" && <Button busy={!!busy} onClick={() => void run("update_offer_status", { id: chosen.id, status: "sent" })} disabled={readOnly}><ArrowUpRight size={16}/> Oznacz wysłanie</Button>}{chosen.status === "sent" && <Button busy={!!busy} onClick={() => void run("update_offer_status", { id: chosen.id, status: "accepted" })} disabled={readOnly}><Check size={16}/> Zaakceptuj</Button>}{linkedOrder ? <Button onClick={() => navigate("orders", linkedOrder.id)}><Package size={16}/> Otwórz {linkedOrder.number}</Button> : chosen.status === "accepted" && <Button busy={!!busy} onClick={() => void run("offer_to_order", { id: chosen.id }, result => navigate("orders", result.id))} disabled={readOnly}><Package size={16}/> Utwórz zamówienie</Button>}</div><div className="ops-info-grid"><Info label="Klient">{chosen.customer}</Info><Info label="Data dokumentu">{dateLabel(chosen.date)}</Info><Info label="Ważna do">{dateLabel(chosen.valid_until)}</Info><Info label="Opiekun">{chosen.owner}</Info></div><ItemTable items={chosen.items}/><div className="ops-offer-bottom"><div className="ops-detail-note"><h4>Warunki i uwagi</h4><p>{chosen.notes || "Warunki do uzgodnienia z klientem."}</p></div><Total row={chosen}/></div><div className="ops-danger-zone"><span>{linkedOrder ? "Oferta ma powiązane zamówienie i pozostaje w historii dokumentów." : ""}</span><Button variant="danger" disabled={readOnly || (!!linkedOrder)} busy={!!busy} onClick={() => setDeleteOffer(chosen)}><Trash2 size={15}/> Usuń ofertę</Button></div></>}
      {selected.kind === "orders" && <><div className="ops-detail-heading"><div><h3>{chosen.customer}</h3></div><Status value={chosen.status}/></div><div className="ops-detail-actions">{chosen.status === "new" && <Button variant="primary" busy={!!busy} onClick={() => void run("update_order", { id: chosen.id, status: "processing" })} disabled={readOnly}><RefreshCw size={16}/> Rozpocznij realizację</Button>}{chosen.status === "processing" && <Button variant="primary" busy={!!busy} onClick={() => void run("update_order", { id: chosen.id, status: "completed" })} disabled={readOnly}><Check size={16}/> Zakończ realizację</Button>}{linkedInvoice ? <Button onClick={() => navigate("invoices", linkedInvoice.id)}><ReceiptText size={16}/> Otwórz {linkedInvoice.number}</Button> : <Button busy={!!busy} onClick={() => void run("create_invoice", { order_id: chosen.id }, result => navigate("invoices", result.id))} disabled={readOnly}><ReceiptText size={16}/> Wystaw fakturę</Button>}{chosen.offer_id && <Button onClick={() => navigate("offers", chosen.offer_id)}>Źródłowa oferta <ArrowUpRight size={16}/></Button>}</div><div className="ops-info-grid"><Info label="Klient">{chosen.customer}</Info><Info label="Data zamówienia">{dateLabel(chosen.date)}</Info><Info label="Termin realizacji">{dateLabel(chosen.delivery_date)}</Info><Info label="Odpowiedzialny">{chosen.owner}</Info></div><div className="ops-order-steps">{["new", "processing", "completed"].map((step, index) => <div className={index <= ["new", "processing", "completed"].indexOf(chosen.status) ? "current" : ""} key={step}><span>{index + 1}</span><b>{statusNames[step]}</b></div>)}</div><ItemTable items={chosen.items}/><div className="ops-align-total"><Total row={chosen}/></div></>}
      {selected.kind === "invoices" && <><div className="ops-detail-heading"><div><h3>{chosen.customer}</h3></div><Status value={chosen.status}/></div><div className="ops-detail-actions"><Button variant="primary" onClick={() => showPdf("invoice", chosen)}><FileText size={16}/> Podgląd PDF</Button>{num(chosen.balance_gross) > 0 && <Button onClick={() => { setPayment(chosen); setPaymentAmount(String(chosen.balance_gross)); }} disabled={readOnly}><CreditCard size={16}/> Dodaj wpłatę</Button>}<Button disabled={readOnly || (chosen.ksef_status === "accepted_demo" || !!busy)} busy={busy.startsWith("send_ksef")} onClick={() => void run("send_ksef", { id: chosen.id })}><ShieldCheck size={16}/> {chosen.ksef_status === "accepted_demo" ? "KSeF przyjęty · DEMO" : "Symuluj KSeF"}</Button>{chosen.order_id && <Button onClick={() => navigate("orders", chosen.order_id)}>Zamówienie <ArrowUpRight size={16}/></Button>}</div><div className="ops-info-grid"><Info label="Data dokumentu">{dateLabel(chosen.date)}</Info><Info label="Termin płatności">{dateLabel(chosen.due_date)}</Info><Info label="Wpłacono brutto">{money(chosen.paid_gross)}</Info><Info label="Saldo brutto">{money(chosen.balance_gross)}</Info></div><ItemTable items={chosen.items}/><div className="ops-offer-bottom"><div className="ops-detail-note"><h4>Obieg KSeF</h4><Status value={chosen.ksef_status}/>{chosen.ksef_id && <code className="ops-reference">{chosen.ksef_id}</code>}<p className="ops-action-caption">Symulacja KSeF · bez połączenia z urzędem</p></div><Total row={chosen}/></div></>}
      {selected.kind === "products" && <><div className="ops-product-detail-icon">{chosen.category === "license" ? <BadgeCheck size={38}/> : chosen.category === "service" ? <Layers3 size={38}/> : <Package size={38}/>}</div><div className="ops-detail-heading"><div><h3>{chosen.name}</h3><p>{chosen.description}</p></div></div><div className="ops-info-grid"><Info label="SKU">{chosen.sku}</Info><Info label="Dostawca / marka">{chosen.producer}</Info><Info label="Wariant">{chosen.variant}</Info><Info label="Cena netto">{money(chosen.price_net)}</Info><Info label="Koszt netto">{money(chosen.cost_net)}</Info><Info label="Marża na cenie netto">{num(chosen.price_net) > 0 ? `${((num(chosen.price_net) - num(chosen.cost_net)) / num(chosen.price_net) * 100).toFixed(1)}%` : "—"}</Info><Info label="Jednostka">{chosen.unit}</Info><Info label="Dostępność">{chosen.category === "hardware" ? `${chosen.stock} ${chosen.unit || "szt."} w magazynie` : "Do ustalenia w ofercie"}</Info></div><Button variant="primary" onClick={() => { setEditor({ product: chosen }); setSelected(null); }} disabled={readOnly}><FilePlus2 size={17}/> Dodaj do nowej oferty</Button></>}
      {selected.kind === "licenses" && <><div className="ops-detail-heading"><div><h3>{chosen.product}</h3><p>{chosen.customer}</p></div><Status value={chosen.status}/></div><div className="ops-license-clock"><CalendarDays size={30}/><strong>{num(chosen.days_remaining) < 0 ? `${Math.abs(num(chosen.days_remaining))} dni` : `${num(chosen.days_remaining)} dni`}</strong><span>{num(chosen.days_remaining) < 0 ? "od wygaśnięcia" : "do odnowienia"}</span><small>{dateLabel(chosen.expires_at)}</small></div><div className="ops-info-grid"><Info label="Jednostki">{chosen.seats}</Info><Info label="Wartość netto">{money(chosen.value_net)}</Info><Info label="Początek okresu">{dateLabel(chosen.starts_at)}</Info><Info label="Opiekun">{chosen.owner}</Info></div><div className="ops-detail-actions"><Button variant="primary" onClick={() => { setEditor({ license: chosen }); setSelected(null); }} disabled={readOnly}><FilePlus2 size={16}/> Oferta odnowienia</Button><Button busy={!!busy} onClick={() => void run("renew_license", { id: chosen.id })} disabled={readOnly}><RefreshCw size={16}/> Odnów umowę</Button></div><p className="ops-action-caption">Odnowienie testowe · bez zamówienia i płatności</p></>}
      {selected.kind === "documents" && <><div className="ops-detail-heading"><div><h3>{chosen.name}</h3><p>{chosen.customer} · {chosen.category}</p></div><Status value={chosen.status}/></div><div className="ops-detail-actions"><Button variant="primary" onClick={() => showPdf("document", chosen)}><FileText size={16}/> Podgląd dokumentu</Button><Button busy={!!busy} onClick={() => void run("analyze_document", { id: chosen.id }, result => setAnalysis({ id: chosen.id, data: result }))} disabled={readOnly}><Sparkles size={16}/> Analizuj z Copilotem</Button></div><div className="ops-info-grid"><Info label="Data dodania">{dateLabel(chosen.date)}</Info><Info label="Właściciel">{chosen.owner}</Info><Info label="Format">{chosen.kind}</Info><Info label="Rozmiar">{chosen.size}</Info></div><div className="ops-tags">{(chosen.tags || []).map((tag: string) => <span key={tag}><Tag size={12}/>{tag}</span>)}</div>{(analysis?.id === chosen.id || chosen.analysis) && <DocumentAnalysis data={analysis?.id === chosen.id ? analysis.data : chosen.analysis}/>}<div className="ops-source-text"><div><FileSearch size={18}/><h4>Treść dokumentu</h4></div><pre>{chosen.source_text || "Ten dokument nie ma przykładowej warstwy tekstowej."}</pre></div></>}
      {selected.kind === "projects" && <><div className="ops-detail-heading"><div><h3>{chosen.name}</h3><p>{chosen.customer}</p></div><Status value={chosen.status}/></div><div className="ops-detail-actions"><Button variant="primary" onClick={() => { setProjectEdit(chosen); setProjectProgress(num(chosen.progress)); setProjectStatus(chosen.status); }} disabled={readOnly}><Pencil size={16}/> Aktualizuj postęp</Button><Button onClick={() => navigate("calendar")}><CalendarDays size={16}/> Plan zespołu</Button></div><div className="ops-info-grid"><Info label="Odpowiedzialny">{chosen.owner}</Info><Info label="Termin projektu">{dateLabel(chosen.deadline)}</Info><Info label="Budżet netto">{money(chosen.budget_net)}</Info><Info label="Wykorzystano netto">{money(chosen.spent_net)}</Info></div><div className="ops-project-progress-detail"><div className="ops-progress-label"><span>Realizacja projektu</span><b>{chosen.progress}%</b></div><div className="ops-progress"><span style={{ width: `${Math.min(100, num(chosen.progress))}%` }}/></div></div><h4 className="ops-subtitle">Etapy i zadania projektu</h4><div className="ops-project-tasks">{(chosen.tasks || []).map((task: Entity) => <div key={task.id}><button type="button" className={`ops-task-check ${task.status === "done" ? "done" : ""}`} disabled={readOnly || (!!busy)} aria-pressed={task.status === "done"} aria-label={`${task.status === "done" ? "Oznacz jako do wykonania" : "Zakończ zadanie"}: ${task.title}`} title={task.status === "done" ? "Przywróć do wykonania" : "Oznacz jako wykonane"} onClick={() => void run("complete_project_task", { project_id: chosen.id, id: task.id, status: task.status === "done" ? "todo" : "done" })}>{task.status === "done" ? <Check size={14}/> : <span/>}</button><span><strong>{task.title}</strong><small>{task.owner}</small></span><Status value={task.status}/></div>)}</div></>}
    </Modal>}
    {!readOnly && editor && <OfferEditor {...editor} state={state} close={closeEditor} save={save} onSaved={id => { setEditor(null); if (page === "offers") setSelected({ kind: "offers", id }); navigate("offers", id); }}/>} 
    {!readOnly && productForm && <ProductForm company={state.meta.company} close={() => setProductForm(false)} save={save}/>}
    {!readOnly && deleteOffer && <Modal title="Usunąć ofertę?" onClose={() => setDeleteOffer(null)} footer={<><Button onClick={() => setDeleteOffer(null)} disabled={readOnly}>Anuluj</Button><Button variant="danger" busy={!!busy} onClick={() => void run("delete_offer", { id: deleteOffer.id }, () => { setDeleteOffer(null); closeDetails(); })} disabled={readOnly}><Trash2 size={16}/> Usuń ofertę</Button></>}><p className="ops-modal-intro"><strong>{deleteOffer.number}</strong> · {deleteOffer.customer}</p><p className="ops-action-caption">Oferta zostanie usunięta z bieżącej przestrzeni.</p></Modal>}
    {!readOnly && payment && <Modal title="Zarejestruj wpłatę" eyebrow={payment.number} onClose={() => setPayment(null)} footer={<><Button onClick={() => setPayment(null)} disabled={readOnly}>Anuluj</Button><Button variant="primary" busy={!!busy} onClick={() => { const amount = num(paymentAmount); if (amount <= 0 || amount > num(payment.balance_gross)) { notify("Wpłata musi być dodatnia i nie większa od pozostałego salda.", "error"); return; } void run("pay_invoice", { id: payment.id, amount }, () => setPayment(null)); }} disabled={readOnly}><Check size={16}/> Zapisz wpłatę</Button></>}><p className="ops-modal-intro">{payment.customer}</p><div className="ops-info-grid"><Info label="Kwota faktury brutto">{money(payment.gross_total)}</Info><Info label="Pozostało brutto">{money(payment.balance_gross)}</Info></div><Field label="Wpłata brutto (PLN)"><input type="number" min="0.01" step="0.01" max={payment.balance_gross} value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)}/></Field><p className="ops-action-caption">Wpłata testowa · bez połączenia z bankiem</p></Modal>}
    {!readOnly && projectEdit && <Modal title="Aktualizuj projekt" eyebrow={projectEdit.name} onClose={() => setProjectEdit(null)} footer={<><Button onClick={() => setProjectEdit(null)} disabled={readOnly}>Anuluj</Button><Button variant="primary" busy={!!busy} onClick={() => void run("update_project", { id: projectEdit.id, progress: projectProgress, status: projectStatus }, () => setProjectEdit(null))} disabled={readOnly}>Zapisz postęp</Button></>}><Field label={`Postęp: ${projectProgress}%`}><input type="range" min="0" max="100" step="5" value={projectProgress} onChange={event => setProjectProgress(num(event.target.value))}/></Field><Field label="Status projektu"><select value={projectStatus} onChange={event => setProjectStatus(event.target.value)}>{Array.from(new Set([projectEdit.status, "active", "paused", "completed"])).map(value => <option key={value} value={value}>{statusNames[value] || value}</option>)}</select></Field></Modal>}
    {pdf && <PdfPreview title={pdf.title} url={pdf.url} close={() => setPdf(null)}/>}
  </div>;
}

function RevenueChart({ rows, metric }: { rows: Entity[]; metric: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = useState(900);
  const [selectedIndex, setSelectedIndex] = useState(rows.length - 1);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setChartW(Math.max(300, Math.min(1100, entry.contentRect.width))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const valueOf = (row: Entity) => metric === "margin" ? num(row.profit) / Math.max(1, num(row.revenue)) * 100 : num(row[metric]);
  const displayValue = (value: number) => metric === "margin" ? `${value.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%` : money(value);
  const metricName = metric === "margin" ? "Marża sprzedaży" : metric === "profit" ? "Wynik na sprzedaży" : metric === "cost" ? "Koszt sprzedaży" : "Przychód netto";
  const max = metric === "margin" ? Math.max(100, ...rows.map(valueOf)) : Math.max(1, ...rows.flatMap(row => [valueOf(row), ...(metric === "revenue" ? [num(row.goal)] : [])]));
  const chartH = chartW < 500 ? 240 : 300, left = chartW < 500 ? 52 : 70, right = chartW < 500 ? 12 : 25, bottom = 40, top = 24;
  const graphH = chartH - top - bottom; const step = (chartW - left - right) / Math.max(1, rows.length);
  const labelStep = Math.max(1, Math.ceil(rows.length / (chartW < 500 ? 5 : 12)));
  const currentIndex = Math.max(0, Math.min(selectedIndex, rows.length - 1));
  const selected = rows[currentIndex];
  return <div className="ops-revenue-chart" ref={ref}>
    <svg viewBox={`0 0 ${chartW} ${chartH}`} role="group" aria-label={`${metricName} według miesiąca. Wybierz słupek, aby sprawdzić wynik. Pełne dane znajdują się w tabeli poniżej.`}>
      <defs><linearGradient id="opsRevenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ops-accent)"/><stop offset="100%" stopColor="var(--ops-accent-soft)"/></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(index => { const y = top + graphH - graphH * index / 4; return <g key={index} aria-hidden="true"><line x1={left} x2={chartW - right} y1={y} y2={y} className="ops-chart-grid"/><text x={left - 10} y={y + 4} textAnchor="end">{metric === "margin" ? `${Math.round(max * index / 4)}%` : `${Math.round(max * index / 4 / 1000)} tys.`}</text></g>; })}
      {rows.map((row, index) => {
        const x = left + step * index + step / 2, height = Math.max(0, valueOf(row) / max * graphH);
        const goalY = top + graphH - num(row.goal) / max * graphH;
        const label = /^\d{4}-\d{2}$/.test(row.month) ? `${row.month.slice(5)}.${row.month.slice(2, 4)}` : row.month;
        return <g key={row.id || row.month} role="button" tabIndex={0} aria-pressed={index === currentIndex} aria-label={`${row.month}: ${metricName.toLocaleLowerCase("pl")} ${displayValue(valueOf(row))}`} onClick={() => setSelectedIndex(index)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedIndex(index); } }}>
          <title>{row.month}: {displayValue(valueOf(row))}</title>
          <rect className="ops-chart-hit" x={left + step * index + 2} y={top} width={Math.max(1, step - 4)} height={graphH + 27} rx="8" fill={index === currentIndex ? "var(--ops-tint)" : "transparent"}/>
          <rect x={x - Math.min(30, step * .24)} y={top + graphH - height} width={Math.min(60, step * .48)} height={height} rx="6" fill="url(#opsRevenueGradient)" opacity={index === currentIndex ? 1 : .65}/>
          {metric === "revenue" && <line x1={x - Math.min(38, step * .32)} x2={x + Math.min(38, step * .32)} y1={goalY} y2={goalY} className="ops-chart-target"/>}
          {index % labelStep === 0 && <text x={x} y={chartH - 15} textAnchor="middle">{label}</text>}
        </g>;
      })}
    </svg>
    {selected && <div className="ops-chart-insight" aria-live="polite"><span><small>Wybrany miesiąc</small><strong>{selected.month}</strong></span><span><small>Przychód netto</small><strong>{money(selected.revenue)}</strong></span><span><small>Koszt sprzedaży</small><strong>{money(selected.cost)}</strong></span><span><small>Wynik netto</small><strong>{money(selected.profit)}</strong></span></div>}
  </div>;
}

function DocumentAnalysis({ data }: { data: Entity }) {
  const fields = Array.isArray(data.fields) ? data.fields : Array.isArray(data.requirements) ? data.requirements : [];
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  const sources: Entity[] = Array.isArray(data.sources) ? data.sources : [];
  const summary = data.summary || data.result?.summary || "Przykładowa analiza porządkuje treść dokumentu i wskazuje informacje do sprawdzenia przez pracownika.";
  return <section className="ops-analysis"><div><span className="ops-analysis-icon"><Sparkles size={20}/></span><span><h4>Analiza dokumentu</h4><small>Symulacja · sprawdź źródła</small></span><Badge tone="info">AI · DEMO</Badge></div><p>{summary}</p>{fields.length > 0 && <dl>{fields.map((field: Entity | string, index: number) => <div key={typeof field === "string" ? field : field.id || index}><dt>{typeof field === "string" ? `Informacja ${index + 1}` : field.label || field.name || field.key || `Informacja ${index + 1}`}</dt><dd>{typeof field === "string" ? field : field.value || field.description || field.text || "Do sprawdzenia"}</dd>{typeof field !== "string" && field.source && <small className="ops-field-source">Źródło: {field.source}</small>}</div>)}</dl>}{sources.length > 0 && <div className="ops-analysis-sources"><h5>Materiały źródłowe</h5>{sources.map((source, index) => <details key={source.id || index}><summary>{source.name || `Dokument ${index + 1}`}</summary><p>{source.excerpt || "Przykładowy dokument dostępny w repozytorium tej sesji."}</p></details>)}</div>}{warnings.length > 0 && <ul>{warnings.map((warning: string, index: number) => <li key={index}>{warning}</li>)}</ul>}<small className="ops-analysis-disclaimer">Wynik symulowany. Sprawdź źródła przed użyciem.</small></section>;
}
