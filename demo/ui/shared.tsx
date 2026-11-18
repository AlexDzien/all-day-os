import { lockPageScroll } from "./scrollLock";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X, Inbox, LoaderCircle } from "lucide-react";

export const money = (value: number | string = 0, compact = false) => new Intl.NumberFormat("pl-PL", {
  style: "currency", currency: "PLN", maximumFractionDigits: compact ? 0 : 2,
}).format(Number(value) || 0);
export const dateLabel = (value: string, time = false) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "—" : new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw", day: "numeric", month: "short", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};
export const cx = (...values: (string | false | null | undefined)[]) => values.filter(Boolean).join(" ");
export function Button({ children, variant = "secondary", busy, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; busy?: boolean }) {
  return <button type="button" {...props} disabled={props.disabled || busy} className={cx("button", variant, className)}>{busy && <LoaderCircle size={16} className="spin" />}{children}</button>;
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  const semantic = ({good:"green",bad:"rose",warn:"amber"} as Record<string,string>)[tone] || tone;
  return <span className={`badge tone-${semantic}`}>{children}</span>;
}
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={cx("panel", className)}>{children}</section>;
}
export function Field({ label, children, className = "", hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return <label className={cx("field", className)}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Empty({ title = "Nie znaleziono wyników", description = "Zmień filtry lub dodaj pierwszy rekord.", action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Inbox size={25}/></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function Modal({ title, eyebrow, children, onClose, wide = false, footer }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const releaseScroll = lockPageScroll();
    const target = ref.current?.querySelector<HTMLElement>("input,textarea,select") || ref.current?.querySelector<HTMLElement>("button");
    target?.focus();
    const key = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || []);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); releaseScroll(); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx("modal", wide && "modal-wide")}><header><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Zamknij okno"><X size={21}/></button></header><div className="modal-body">{children}</div>{footer && <footer>{footer}</footer>}</div></div>;
}
export function Avatar({ name = "?", color = "blue", small = false }: { name?: string; color?: string; small?: boolean }) {
  return <span className={cx("avatar", `avatar-${color}`, small && "avatar-small")}>{name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("")}</span>;
}
