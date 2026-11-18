import { lockPageScroll } from "./scrollLock";
/* Static screenshots are served by the Vite demo, outside the Next.js image runtime. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, Expand, FileText, List, Printer, Search, SlidersHorizontal, Sparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Navigate } from "./types";
import { guideDeliverySteps, guideMeta, guideRoles, guideScreenshots, guideSections, guideWorkflows } from "./guideContent";
import type { GuideRole, GuideScreenshot, GuideSection } from "./guideContent";
import "./Guide.css";

export { guideSections, guideScreenshots } from "./guideContent";

const progressKey = "allday-demo-guide-progress-v1";
const normalize = (value: string) => value.toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
const screenshotByFile = new Map(guideScreenshots.map(item => [item.file, item]));
const categories = [...new Set(guideSections.map(section => section.category))];

function readProgress() {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(progressKey) || "[]");
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string" && guideSections.some(section => section.id === id)) : []);
  } catch { return new Set<string>(); }
}

function GuideImage({ item, onOpen }: { item: GuideScreenshot; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  return <figure className="guide-shot">
    <button onClick={onOpen} disabled={failed} aria-label={`Powiększ ilustrację: ${item.title}`}>
      {failed ? <span className="guide-shot-unavailable"><FileText size={28}/><strong>{item.title}</strong><small>Ilustracja jest chwilowo niedostępna.</small></span> : <img src={item.file} alt={item.description} loading="lazy" width={1440} height={1000} onError={() => setFailed(true)}/>}
      {!failed && <span className="guide-shot-expand"><Expand size={15}/> Powiększ</span>}
    </button>
    <figcaption><strong>{item.title}</strong><span>{item.description}</span></figcaption>
  </figure>;
}

function ScreenshotLightbox({ items, index, setIndex, close }: { items: GuideScreenshot[]; index: number; setIndex: (index: number) => void; close: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState(false);
  const item = items[index];
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    closeButton.current?.focus();
    return () => { releaseScroll(); previous?.focus(); };
  }, []);
  return <div className="guide-lightbox" onClick={event => { if (event.target === event.currentTarget) close(); }} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === "ArrowRight" && items.length > 1) { event.preventDefault(); setZoom(false); setIndex((index + 1) % items.length); }
    if (event.key === "ArrowLeft" && items.length > 1) { event.preventDefault(); setZoom(false); setIndex((index + items.length - 1) % items.length); }
    if (event.key === "Tab") {
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") || []);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="guide-lightbox-title" className="guide-lightbox-dialog">
      <header><div><small>WIDOK SYSTEMU · {index + 1}/{items.length}</small><h2 id="guide-lightbox-title">{item.title}</h2></div><button className="guide-icon-action" onClick={() => setZoom(value => !value)} aria-label={zoom ? "Dopasuj do okna" : "Pokaż pełny rozmiar"}>{zoom ? <ZoomOut size={21}/> : <ZoomIn size={21}/>}</button><button ref={closeButton} className="guide-icon-action" onClick={close} aria-label="Zamknij podgląd"><X size={22}/></button></header>
      <div className={`guide-lightbox-image ${zoom ? "is-zoomed" : ""}`}><img src={item.file} alt={item.description}/></div>
      <footer><p>{item.description}</p>{items.length > 1 && <div><button className="guide-icon-action" onClick={() => { setZoom(false); setIndex((index + items.length - 1) % items.length); }} aria-label="Poprzednia ilustracja"><ChevronLeft size={21}/></button><button className="guide-icon-action" onClick={() => { setZoom(false); setIndex((index + 1) % items.length); }} aria-label="Następna ilustracja"><ChevronRight size={21}/></button></div>}<small>Esc — zamknij</small></footer>
    </div>
  </div>;
}

export function Guide({ navigate, onConsult }: { navigate: Navigate; onConsult?: () => void }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<GuideRole | "all">("all");
  const [category, setCategory] = useState("all");
  const [workflow, setWorkflow] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["start"]));
  const [read, setRead] = useState(readProgress);
  const [active, setActive] = useState("start");
  const [printing, setPrinting] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: GuideScreenshot[]; index: number } | null>(null);
  const visibleSections = useMemo(() => {
    if (printing) return guideSections;
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const path = guideWorkflows.find(item => item.id === workflow);
    return guideSections.filter(section => {
      const text = normalize([section.title, section.summary, section.benefit, ...section.features, ...section.steps].join(" "));
      return (role === "all" || section.roles.includes(role)) && (category === "all" || section.category === category) && (!path || path.sections.includes(section.id)) && words.every(word => text.includes(word));
    });
  }, [query, role, category, workflow, printing]);
  const progress = Math.round(read.size / guideSections.length * 100);
  const consult = () => onConsult ? onConsult() : navigate("your-system");
  useEffect(() => {
    try { localStorage.setItem(progressKey, JSON.stringify([...read])); } catch { /* Progress remains available for this visit. */ }
  }, [read]);
  useEffect(() => {
    const afterPrint = () => setPrinting(false);
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);
  const resetFilters = () => { setQuery(""); setRole("all"); setCategory("all"); setWorkflow(""); };
  const openSection = (id: string) => {
    setExpanded(old => new Set([...old, id])); setActive(id);
    requestAnimationFrame(() => document.getElementById(`guide-chapter-${id}`)?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const markRead = (id: string) => setRead(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const printGuide = async () => {
    setPrinting(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    const images = Array.from(document.querySelectorAll<HTMLImageElement>(".guide-workspace img"));
    images.forEach(image => { image.loading = "eager"; });
    await Promise.race([Promise.allSettled(images.map(image => image.decode())), new Promise(resolve => setTimeout(resolve, 2500))]);
    window.print();
    setPrinting(false);
  };
  const tableOfContents = <nav aria-label="Spis treści instrukcji">{visibleSections.map((section, index) => <button key={section.id} onClick={() => openSection(section.id)} aria-current={active === section.id ? "location" : undefined}><span className={read.has(section.id) ? "is-read" : ""}>{read.has(section.id) ? <Check size={12}/> : String(index + 1).padStart(2, "0")}</span><span>{section.title}</span><ChevronRight size={13}/></button>)}</nav>;

  return <div className={`guide-workspace ${printing ? "guide-print-all" : ""}`}>
    <header className="guide-hero"><div><span className="guide-eyebrow"><BookOpen size={15}/> CENTRUM WIEDZY</span><h1>Poznaj system.<br/><em>Zobacz, jak pracować.</em></h1><p>Instrukcje, przykłady i widoki aplikacji. Od pierwszego kontaktu z klientem do realizacji i rozliczenia.</p><div className="guide-hero-actions"><button className="guide-button guide-button-primary" onClick={() => openSection(visibleSections[0]?.id || "start")}><ArrowDown size={16}/> Zacznij tutaj</button><a className="guide-button" href={guideMeta.pdf} download><Download size={16}/> Pobierz PDF</a><button className="guide-button guide-print-button" disabled={printing} onClick={() => void printGuide()}><Printer size={16}/>{printing ? "Przygotowanie…" : "Drukuj"}</button></div></div><aside><span className="guide-cover-icon"><BookOpen size={34}/></span><strong>28 rozdziałów.<br/>Jeden wspólny proces.</strong><p>Wybierz rolę lub temat.<br/>Wróć do konkretnej funkcji wtedy, gdy jej potrzebujesz.</p><span>{guideMeta.version} · All Day IT</span></aside></header>

    <section className="guide-paths" aria-label="Ścieżki prezentacji">{guideWorkflows.map((path, index) => <button key={path.id} aria-pressed={workflow === path.id} onClick={() => { setWorkflow(workflow === path.id ? "" : path.id); setQuery(""); setRole("all"); setCategory("all"); }}><span>0{index + 1}</span><div><strong>{path.title}</strong><small>{path.description}</small></div><ArrowRight size={18}/></button>)}</section>

    <section className="guide-find" aria-label="Znajdź instrukcję"><label className="guide-search"><Search size={20}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Czego szukasz? Np. załącznik, rabat, zadanie…" aria-label="Wyszukaj w instrukcji"/>{query && <button aria-label="Wyczyść wyszukiwanie" onClick={() => setQuery("")}><X size={17}/></button>}</label><label className="guide-category"><SlidersHorizontal size={17}/><select value={category} onChange={event => setCategory(event.target.value)} aria-label="Temat instrukcji"><option value="all">Wszystkie tematy</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></label><div className="guide-role-filter" role="group" aria-label="Perspektywa użytkownika"><button onClick={() => setRole("all")} aria-pressed={role === "all"}>Dla każdego</button>{guideRoles.map(item => <button key={item.id} title={item.description} onClick={() => setRole(item.id)} aria-pressed={role === item.id}>{item.label}</button>)}</div><div className="guide-find-footer"><span role="status">{visibleSections.length} z {guideSections.length} rozdziałów {workflow && `· ${guideWorkflows.find(item => item.id === workflow)?.title}`}</span>{(query || role !== "all" || category !== "all" || workflow) && <button onClick={resetFilters}>Wyczyść filtry <X size={13}/></button>}<button onClick={() => setExpanded(old => visibleSections.every(section => old.has(section.id)) ? new Set() : new Set(visibleSections.map(section => section.id)))}><List size={14}/>{visibleSections.every(section => expanded.has(section.id)) ? "Zwiń rozdziały" : "Rozwiń rozdziały"}</button></div></section>

    <div className="guide-layout"><aside className="guide-toc"><header><List size={17}/><strong>W przewodniku</strong></header>{tableOfContents}<footer><div><span>Twój postęp</span><strong>{read.size}/{guideSections.length}</strong></div><progress value={progress} max={100} aria-label="Postęp przeczytanych rozdziałów"/><small>Zapamiętany w tej przeglądarce.</small></footer></aside><div className="guide-chapters"><details className="guide-mobile-toc"><summary><List size={18}/> Spis treści <ChevronDown size={16}/></summary>{tableOfContents}</details>
      {!visibleSections.length && <div className="guide-no-results"><Search size={34}/><h2>Nie znaleziono tego tematu</h2><p>Spróbuj krótszego hasła albo wyczyść filtry.</p><button className="guide-button" onClick={resetFilters}>Pokaż wszystkie rozdziały</button></div>}
      {visibleSections.map(section => <GuideChapter key={section.id} section={section} number={guideSections.indexOf(section) + 1} open={printing || expanded.has(section.id)} read={read.has(section.id)} onToggle={() => { setActive(section.id); setExpanded(old => { const next = new Set(old); if (next.has(section.id)) next.delete(section.id); else next.add(section.id); return next; }); }} onRead={() => markRead(section.id)} onNavigate={() => navigate(section.route, section.recordId)} onImage={(items, index) => setLightbox({ items, index })}/>)}
    </div></div>

    <section className="guide-delivery"><header><span className="guide-eyebrow"><Sparkles size={15}/> WŁASNY SYSTEM Z ALL DAY IT</span><h2>Najpierw rozumiemy pracę.<br/>Potem projektujemy narzędzia.</h2><p>Demo pokazuje połączone możliwości. Zakres, nazwy, uprawnienia i integracje dopasowujemy do konkretnej firmy.</p></header><ol>{guideDeliverySteps.map((step, index) => <li key={step.title}><span>0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol><footer><div><h3>Ułóż wstępny plan dla swojej firmy.</h3><p>Wybierz cele i moduły. Przygotuj brief, od którego możemy zacząć rozmowę.</p></div><button className="guide-button guide-button-primary" onClick={consult}>Zaprojektuj swój system <ArrowRight size={17}/></button></footer></section>
    <footer className="guide-footer"><span><BookOpen size={16}/>{guideMeta.title}</span><a href={guideMeta.contactUrl} target="_blank" rel="noopener noreferrer">All Day IT <ArrowRight size={14}/></a></footer>
    {lightbox && <ScreenshotLightbox items={lightbox.items} index={lightbox.index} setIndex={index => setLightbox(old => old ? { ...old, index } : null)} close={() => setLightbox(null)}/>}
  </div>;
}

function GuideChapter({ section, number, open, read, onToggle, onRead, onNavigate, onImage }: { section: GuideSection; number: number; open: boolean; read: boolean; onToggle: () => void; onRead: () => void; onNavigate: () => void; onImage: (items: GuideScreenshot[], index: number) => void }) {
  const images = section.screenshots.map(file => screenshotByFile.get(file)).filter((item): item is GuideScreenshot => Boolean(item));
  return <article id={`guide-chapter-${section.id}`} className={`guide-chapter ${open ? "is-open" : ""}`}>
    <h2><button className="guide-chapter-toggle" aria-expanded={open} aria-controls={`guide-body-${section.id}`} onClick={onToggle}><span className={`guide-chapter-number ${read ? "is-read" : ""}`}>{read ? <Check size={20}/> : String(number).padStart(2, "0")}</span><span><small>{section.category}</small><strong>{section.title}</strong></span><ChevronDown size={22}/></button></h2><p className="guide-chapter-summary">{section.summary}</p>
    <div id={`guide-body-${section.id}`} className="guide-chapter-body" hidden={!open}><div className="guide-benefit"><CheckCircle2 size={19}/><p>{section.benefit}</p></div><div className="guide-instructions"><section><h3>Jak to zrobić</h3><ol>{section.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol></section><section><h3>Co znajdziesz w module</h3><ul>{section.features.map(feature => <li key={feature}><Check size={14}/><span>{feature}</span></li>)}</ul></section></div><div className="guide-example"><span>PRZYKŁAD W PRAKTYCE</span><p>{section.example}</p></div><div className={`guide-gallery ${images.length === 1 ? "single" : ""}`}>{images.map((item, index) => <GuideImage key={item.id} item={item} onOpen={() => onImage(images, index)}/>)}</div><p className="guide-source"><FileText size={14}/><span><strong>Skąd dane w przykładzie?</strong> {section.source}</span></p><footer><button className="guide-button" onClick={onNavigate}>Otwórz {section.route === "your-system" ? "konfigurator" : "w systemie"} <ArrowRight size={15}/></button><button className="guide-read-action" aria-pressed={read} onClick={onRead}>{read ? <CheckCircle2 size={17}/> : <span/>}{read ? "Przeczytane" : "Oznacz jako przeczytane"}</button></footer></div>
  </article>;
}
