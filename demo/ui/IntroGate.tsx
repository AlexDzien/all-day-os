import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AllDayLogo } from "./AllDayLogo";
import { DemoIntro } from "./DemoIntro";

const STORAGE_KEY = "allday-demo-intro-seen";
const COOKIE_KEY = "adit_demo_intro_seen";
let seenInThisTab = false;

function hasSeenIntro() {
  if (seenInThisTab) return true;
  try { if (localStorage.getItem(STORAGE_KEY) === "1") return true; } catch { /* First-party cookie is a fallback. */ }
  try { return document.cookie.split(";").some(value => value.trim() === `${COOKIE_KEY}=1`); } catch { return false; }
}

function rememberIntro() {
  // Mark at first display: reloading or closing the tab midway never replays it.
  seenInThisTab = true;
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* The intro remains skippable when storage is restricted. */ }
  try { document.cookie = `${COOKIE_KEY}=1; Path=/; Max-Age=34560000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* In-memory state still covers navigation in this tab. */ }
}

export function IntroGate({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(() => !hasSeenIntro());
  useEffect(() => { if (visible) rememberIntro(); }, [visible]);
  const finish = useCallback(() => {
    setVisible(false);
    requestAnimationFrame(() => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(node => node.getClientRects().length > 0);
      const dialog = dialogs.at(-1);
      const control = dialog?.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled)');
      (control || dialog || document.getElementById("main-content"))?.focus({preventScroll:true});
    });
  }, []);
  return <>
    <div className="demo-app-gate" inert={visible} aria-hidden={visible || undefined}>{children}</div>
    {visible && <DemoIntro logo={<AllDayLogo/>} onComplete={finish}/>}
  </>;
}
