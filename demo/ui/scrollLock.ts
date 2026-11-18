// Overlapping dialogs share one scroll lock, regardless of their closing order.
const locks = new Set<symbol>();
let previousOverflow = "";

export function lockPageScroll() {
  if (!locks.size) previousOverflow = document.body.style.overflow;
  const token = Symbol("dialog-scroll-lock");
  locks.add(token);
  document.body.style.overflow = "hidden";
  return () => {
    if (!locks.delete(token)) return;
    if (!locks.size) document.body.style.overflow = previousOverflow;
  };
}
