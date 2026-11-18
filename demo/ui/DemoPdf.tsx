import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./DemoPdf.css";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Isolated self-hosted PDF renderer adapted from the NeoPlant offer viewer. */
export default function DemoPdf({ url, title }: { url: string; title: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(650);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const task = getDocument({ url, withCredentials: true, useWasm: false });
    task.promise.then(document => {
      if (active) { setPdf(document); setPage(1); setError(""); }
    }).catch(() => {
      if (active) { setError("Nie udało się otworzyć PDF. Skorzystaj z pobierania lub otwórz dokument osobno."); setLoading(false); }
    });
    return () => { active = false; void task.destroy().catch(() => {}); };
  }, [url]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let render: RenderTask | undefined;
    pdf.getPage(page).then(async documentPage => {
      if (!active || !canvas.current) return;
      setLoading(true);
      const base = documentPage.getViewport({ scale: 1 });
      const scale = Math.max(160, Math.min(width - 24, 800)) / base.width * zoom;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = documentPage.getViewport({ scale: scale * density });
      const target = canvas.current;
      target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height);
      target.style.width = `${viewport.width / density}px`; target.style.height = `${viewport.height / density}px`;
      const context = target.getContext("2d");
      if (!context) throw new Error("Brak obsługi podglądu canvas");
      render = documentPage.render({ canvas: target, canvasContext: context, viewport });
      await render.promise;
      if (active) { setLoading(false); setError(""); }
    }).catch(reason => {
      if (active && reason?.name !== "RenderingCancelledException") {
        setError("Nie udało się wyświetlić strony. Pobierz oryginalny dokument."); setLoading(false);
      }
    });
    return () => { active = false; render?.cancel(); };
  }, [pdf, page, zoom, width]);
  return <div className="demo-pdf-viewer">
    <div className="demo-pdf-toolbar">
      <button type="button" aria-label="Poprzednia strona PDF" disabled={!pdf || page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={18}/></button>
      <span>Strona {page} / {pdf?.numPages || "—"}</span>
      <button type="button" aria-label="Następna strona PDF" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(value => value + 1)}><ChevronRight size={18}/></button>
      <label><span className="sr-only">Powiększenie PDF</span><select aria-label="Powiększenie PDF" value={zoom} onChange={event => setZoom(Number(event.target.value))}>
        <option value={.75}>75%</option><option value={1}>Dopasuj</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option>
      </select></label>
      {loading && !error && <span className="demo-pdf-status" role="status"><LoaderCircle className="spin" size={16}/> Wczytywanie</span>}
    </div>
    {error && <p className="demo-pdf-error" role="alert"><TriangleAlert size={18}/>{error}</p>}
    <div className="demo-pdf-scroll" ref={container}><canvas ref={canvas} role="img" aria-label={`${title}, strona ${page}`}/></div>
  </div>;
}
