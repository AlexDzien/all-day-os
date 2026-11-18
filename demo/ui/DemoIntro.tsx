import { lockPageScroll } from "./scrollLock";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import "./DemoIntro.css";

const scenes = [
  { number: "01", label: "Bliżej klientów", title: "Dobre relacje.", accent: "Wielkie możliwości.", note: "Każdy kontakt. Każda rozmowa. W jednym miejscu." },
  { number: "02", label: "Dalej ze sprzedażą", title: "Mniej chaosu.", accent: "Więcej sprzedaży.", note: "Od pierwszej rozmowy do kolejnego sukcesu." },
  { number: "03", label: "Razem z zespołem", title: "Jeden zespół.", accent: "Wspólny kierunek.", note: "Twój dzień pracy. Wreszcie połączony." },
];

export function DemoIntro({ logo, onComplete }: { logo: ReactNode; onComplete: () => void }) {
  const [phase, setPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const dialogRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const completeRef = useRef(onComplete);
  const completedRef = useRef(false);

  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    completeRef.current();
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
      setPhase(0);
    };
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const timers = reducedMotion
      ? [window.setTimeout(complete, 2200)]
      : [
          window.setTimeout(() => setPhase(1), 1750),
          window.setTimeout(() => setPhase(2), 3500),
          window.setTimeout(complete, 5700),
        ];
    return () => timers.forEach(window.clearTimeout);
  }, [complete, reducedMotion]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    skipRef.current?.focus({ preventScroll: true });

    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], [tabindex="0"]',
    ) || []).filter(item => item.getClientRects().length > 0);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "ArrowRight") {
        event.preventDefault();
        complete();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog?.contains(event.target)) skipRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("focusin", containFocus);
      releaseScroll();
      if (previousFocus?.isConnected && previousFocus !== document.body && (dialog?.contains(document.activeElement) || document.activeElement === document.body)) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [complete]);

  const scene = reducedMotion
    ? { number: "03", label: "Twój biznes, połączony", title: "Twój biznes.", accent: "W jednym miejscu.", note: "Klienci, sprzedaż i zespół. Wspólny rytm pracy." }
    : scenes[phase];

  return <div
    ref={dialogRef}
    className={`demo-intro${reducedMotion ? " demo-intro--still" : ""}`}
    role="dialog"
    aria-modal="true"
    aria-labelledby="demo-intro-title"
    aria-describedby="demo-intro-description"
  >
    <h1 id="demo-intro-title" className="demo-intro-sr">Witaj w demo CRM All Day IT</h1>
    <p id="demo-intro-description" className="demo-intro-sr">Klienci, sprzedaż i zespół w jednym miejscu. Intro zakończy się automatycznie. Możesz je pominąć przyciskiem lub klawiszem Escape.</p>

    <div className="demo-intro-atmosphere" aria-hidden="true">
      <div className="demo-intro-glow" />
      <div className="demo-intro-orbit demo-intro-orbit--one" />
      <div className="demo-intro-orbit demo-intro-orbit--two" />
      <div className="demo-intro-orbit demo-intro-orbit--three" />
      <span className="demo-intro-orbit-dot" />
      <div className="demo-intro-grid" />
    </div>

    <header className="demo-intro-header">
      <div className="demo-intro-brand">{logo}<span className="demo-intro-brand-rule" aria-hidden="true" /><span className="demo-intro-brand-caption">Twój biznes.<br />Twój rytm.</span></div>
      <button ref={skipRef} className="demo-intro-skip" type="button" onClick={complete} aria-keyshortcuts="Escape ArrowRight">
        <span>Pomiń intro</span><kbd aria-hidden="true">Esc</kbd><ArrowRight size={18} aria-hidden="true" />
      </button>
    </header>

    <main className="demo-intro-main">
      <div className="demo-intro-scene" key={reducedMotion ? "still" : phase} aria-hidden="true">
        <div className="demo-intro-eyebrow"><span className="demo-intro-live-dot" /><span>{reducedMotion ? "Twój biznes, połączony" : scene.label}</span><span className="demo-intro-scene-number">/ {scene.number}</span></div>
        <div className="demo-intro-headline"><span>{scene.title}</span><span className="demo-intro-headline-accent">{scene.accent}</span></div>
        <p className="demo-intro-note">{scene.note}</p>
      </div>
      {(phase === 2 || reducedMotion) && <button className="demo-intro-enter" type="button" onClick={complete}>Przejdź do demo<ArrowRight size={19} aria-hidden="true" /></button>}
    </main>

    <footer className="demo-intro-footer">
      <div className="demo-intro-footer-label"><span className="demo-intro-mini-mark" aria-hidden="true">↗</span><span>MNIEJ KLIKANIA.<br /><strong>WIĘCEJ DZIAŁANIA.</strong></span></div>
      <div className="demo-intro-progress" aria-hidden="true">
        <div className="demo-intro-progress-top"><span>POZNAJ SWÓJ CRM</span><span>{scene.number} <span className="demo-intro-progress-total">/ 03</span></span></div>
        <div className="demo-intro-progress-track"><span /></div>
      </div>
    </footer>
  </div>;
}
