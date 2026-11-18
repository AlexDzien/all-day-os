import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, BarChart3, Blocks, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2, ChevronRight, Copy, Download, FileText, Handshake, Mail, MessagesSquare, ShieldCheck, Sparkles, Target, Users, Wallet, Workflow } from "lucide-react";
import type { DemoState, Navigate, Notify } from "./types";
import { Button } from "./shared";
import "./Consultation.css";

const CONTACT_URL = "https://alldayit.pl/kontakt/";
const modules = [
  {id:"crm",label:"Baza klientów",text:"Kontakty i pełna historia relacji",icon:Building2,group:"sales"},
  {id:"sales",label:"Sprzedaż i oferty",text:"Od zapytania do akceptacji",icon:Target,group:"sales"},
  {id:"mail",label:"Poczta",text:"Rozmowy w kontekście sprawy",icon:Mail,group:"sales"},
  {id:"tasks",label:"Zadania i terminy",text:"Właściciel, termin, następny krok",icon:CalendarDays,group:"team"},
  {id:"projects",label:"Realizacja projektów",text:"Etapy, odpowiedzialność i odbiory",icon:BriefcaseBusiness,group:"team"},
  {id:"roles",label:"Zespół i role",text:"Właściwe dane dla właściwych osób",icon:Users,group:"team"},
  {id:"documents",label:"Dokumenty",text:"Jedna uporządkowana baza wiedzy",icon:FileText,group:"data"},
  {id:"automation",label:"Automatyzacje",text:"Sprawy przechodzą między działami",icon:Workflow,group:"data"},
  {id:"integrations",label:"Połączenia systemów",text:"Dane z używanych już narzędzi",icon:Blocks,group:"data"},
  {id:"finance",label:"Finanse",text:"Dokumenty i statusy rozliczeń",icon:Wallet,group:"control"},
  {id:"reports",label:"Raporty",text:"Wyniki oraz priorytety zarządu",icon:BarChart3,group:"control"},
  {id:"ai",label:"Copilot AI",text:"Wsparcie na zatwierdzonych źródłach",icon:Sparkles,group:"data"},
];
const goals = [
  {id:"sales",title:"Uporządkować sprzedaż",icon:Target,modules:["crm","sales","mail","tasks"]},
  {id:"team",title:"Połączyć pracę zespołu",icon:Users,modules:["crm","tasks","projects","roles"]},
  {id:"data",title:"Połączyć dane i systemy",icon:Workflow,modules:["crm","documents","integrations","automation"]},
  {id:"control",title:"Widzieć wyniki i priorytety",icon:BarChart3,modules:["crm","finance","reports","projects"]},
];

export function Consultation({state,navigate,notify}:{state:DemoState;navigate:Navigate;notify:Notify}) {
  const [saved] = useState(() => { try { const value = JSON.parse(sessionStorage.getItem("adit-system-brief-v1") || "{}"); return { goal:goals.some(item=>item.id===value.goal)?value.goal:"sales", selected:Array.isArray(value.selected)?value.selected.filter((id:unknown)=>typeof id==="string"&&modules.some(item=>item.id===id)):goals[0].modules, name:typeof value.name==="string"?value.name.slice(0,140):"", notes:typeof value.notes==="string"?value.notes.slice(0,3000):"" }; } catch { return {goal:"sales",selected:goals[0].modules,name:"",notes:""}; } });
  const [goal,setGoal] = useState(saved.goal);
  const [selected,setSelected] = useState<string[]>(saved.selected);
  const [name,setName] = useState(saved.name);
  const [notes,setNotes] = useState(saved.notes);
  useEffect(()=>{try{sessionStorage.setItem("adit-system-brief-v1",JSON.stringify({goal,selected,name,notes}));}catch{/* The brief remains usable without browser storage. */}},[goal,selected,name,notes]);
  const [copied,setCopied] = useState(false);
  const chosen = modules.filter(module=>selected.includes(module.id));
  const brief = useMemo(()=>[
    "BRIEF DO ROZMOWY Z ALL DAY IT", "",
    `Firma: ${name.trim() || "Do ustalenia"}`,
    `Cel: ${goals.find(item=>item.id===goal)?.title}`,
    `Moduły: ${modules.filter(module=>selected.includes(module.id)).map(module=>module.label).join(", ") || "Do ustalenia"}`,
    "Role: sprzedaż, koordynacja, zarząd - zakres do ustalenia.",
    "",
    "Obecny proces / narzędzia / oczekiwany efekt:",notes.trim() || "Do omówienia podczas rozmowy.",
    "", "Punkt odniesienia: https://demo.alldayit.pl/", CONTACT_URL,
    "", "To wstępny zakres do rozmowy, nie wycena ani potwierdzenie integracji.",
  ].join("\n"),[goal,name,notes,selected]);
  const copy = async()=>{try{await navigator.clipboard.writeText(brief);setCopied(true);notify("Brief skopiowany.");}catch{notify("Skorzystaj z przycisku Pobierz brief.","info");}};
  const download = ()=>{const url=URL.createObjectURL(new Blob(["\ufeff",brief],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="All_Day_IT_brief_systemu.txt";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <div className="consult-workspace">
    <header className="consult-hero"><span className="consult-label"><span/> ZAPROJEKTUJMY TWÓJ SYSTEM</span><h1>Twoje procesy.<br/><em>Twój sposób pracy.</em></h1><p>Demo pokazuje możliwości. Docelowy system projektujemy wokół ludzi, danych i codziennej pracy Twojej firmy.</p><div><a className="button primary" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">Porozmawiajmy o wdrożeniu <ArrowRight size={17}/></a><Button onClick={()=>navigate("guide")}><FileText size={17}/> Poznaj funkcje demo</Button></div><span className="consult-brand">Projekt i wdrożenie <strong>All Day IT</strong></span></header>
    <div className="consult-plan"><section className="consult-builder"><div className="consult-step-title"><b>01</b><div><span>OD CZEGO ZACZYNAMY?</span><h2>Co chcesz usprawnić?</h2></div></div><div className="consult-goals">{goals.map(item=><button key={item.id} aria-pressed={goal===item.id} onClick={()=>{setGoal(item.id);setSelected([...item.modules]);setCopied(false);}}><item.icon size={23}/><strong>{item.title}</strong>{goal===item.id?<CheckCircle2 size={19}/>:<ChevronRight size={18}/>}</button>)}</div>
      <div className="consult-step-title"><b>02</b><div><span>WYBIERZ OBSZARY</span><h2>Co połączymy w jednym miejscu?</h2></div></div><div className="consult-modules">{modules.map(module=><button key={module.id} className={`module-group-${module.group}`} aria-pressed={selected.includes(module.id)} onClick={()=>{setSelected(old=>old.includes(module.id)?old.filter(id=>id!==module.id):[...old,module.id]);setCopied(false);}}><span><module.icon size={21}/></span><span><strong>{module.label}</strong><small>{module.text}</small></span><i>{selected.includes(module.id)&&<Check size={13}/>}</i></button>)}</div>
      <div className="consult-step-title"><b>03</b><div><span>PRZYGOTUJ ROZMOWĘ</span><h2>Kilka słów o Twojej firmie</h2></div></div><div className="consult-fields"><label>Nazwa firmy <span>opcjonalnie</span><input value={name} maxLength={140} onChange={event=>{setName(event.target.value);setCopied(false);}} placeholder="Twoja firma"/></label><label>Jak pracujecie i co chcecie zmienić?<textarea rows={4} maxLength={3000} value={notes} onChange={event=>{setNotes(event.target.value);setCopied(false);}} placeholder="Np. kontakty w arkuszu, zadania w mailach, ręczne tworzenie ofert…"/></label></div><div className="consult-brief-actions"><Button onClick={()=>void copy()}><Copy size={16}/>{copied?"Skopiowano":"Skopiuj brief"}</Button><Button variant="primary" onClick={download}><Download size={16}/> Pobierz brief</Button></div><p className="consult-local-note"><ShieldCheck size={14}/> Brief jest zapamiętany w tej karcie przeglądarki. Samodzielnie przekaż go podczas rozmowy.</p>
    </section><aside className="consult-preview"><div className="consult-preview-heading"><span className="consult-label">TWÓJ WSTĘPNY ZAKRES</span><h2>Jeden spójny proces</h2><p>Przykładowa architektura na podstawie Twojego wyboru.</p></div><div className="consult-flow-start"><MessagesSquare size={22}/><span><strong>Zapytanie klienta</strong><small>Poczta, formularz lub kontakt zespołu</small></span></div><ArrowDown className="consult-flow-arrow" size={20}/><div className="consult-flow-center"><span className="consult-flow-monogram">A</span><div><strong>{name.trim() || "Twój system"}</strong><small>Wspólna baza · jasne uprawnienia</small></div></div><div className="consult-flow-modules">{chosen.map(module=><span key={module.id}><module.icon size={16}/>{module.label}</span>)}{!chosen.length&&<p>Wybierz moduły po lewej stronie.</p>}</div><ArrowDown className="consult-flow-arrow" size={20}/><div className="consult-flow-end"><Handshake size={22}/><span><strong>Zespół wie, co dalej</strong><small>Odpowiedzialność, termin i historia sprawy</small></span></div><footer><b>{chosen.length}</b> wybranych modułów <span>Do dopracowania wspólnie z All Day IT</span></footer></aside></div>
    <section className="consult-delivery"><header><span className="consult-label">OD ROZMOWY DO CODZIENNEJ PRACY</span><h2>Budujemy razem z Twoim zespołem.</h2></header><div>{[["01","Proces","Poznajemy obecną pracę, dane i punkty, w których sprawy się zatrzymują."],["02","Projekt","Ustalamy zakres i pokazujemy interfejs przed rozpoczęciem budowy."],["03","Wdrożenie","Łączymy moduły, sprawdzamy przepływy, szkolimy i uruchamiamy system."],["04","Rozwój","Rozwijamy rozwiązanie na podstawie użycia i kolejnych potrzeb firmy."]].map(([number,title,text])=><article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div><footer><div><h3>Zacznijmy od procesu, który dziś zabiera najwięcej czasu.</h3><p>{state.meta.profile_label} to jeden z przykładów. Twój system może działać inaczej.</p></div><a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="button primary">Kontakt z All Day IT <ArrowRight size={17}/></a></footer></section>
  </div>;
}
