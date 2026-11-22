'use client';
import { useEffect, useRef, useState } from 'react';

/*
 * Prévia do PDF exatamente como será impresso: cada página desenhada como uma folha A4.
 * Usa o pdf.js (carregado só quando abre). Se não carregar, mostra o PDF no leitor do navegador.
 */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

type PdfPage = { getViewport: (options: { scale: number }) => { width: number; height: number }; render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy?: () => void };
type PdfLib = { GlobalWorkerOptions: { workerSrc: string }; getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> } };

let loading: Promise<PdfLib> | null = null;
function loadPdfJs(): Promise<PdfLib> {
  const found = (window as unknown as { pdfjsLib?: PdfLib }).pdfjsLib;
  if (found) return Promise.resolve(found);
  if (loading) return loading;
  loading = new Promise<PdfLib>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS; script.async = true; script.crossOrigin = 'anonymous';
    script.onload = () => { const lib = (window as unknown as { pdfjsLib?: PdfLib }).pdfjsLib; if (!lib) { reject(new Error('sem leitor')); return; } lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; resolve(lib); };
    script.onerror = () => { loading = null; reject(new Error('sem leitor')); };
    document.head.appendChild(script);
  });
  return loading;
}

const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

export function PdfPreview({ title, filename, load, onClose }: { title: string; filename: string; load: () => Promise<Blob>; onClose: () => void }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading');
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    let doc: PdfDoc | null = null;
    document.body.classList.add('has-pdf-viewer');
    (async () => {
      try {
        const blob = await load();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        let lib: PdfLib;
        try { lib = await loadPdfJs(); } catch { if (!cancelled) setState('fallback'); return; }
        doc = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
        if (cancelled || !pagesRef.current) return;
        setPages(doc.numPages);
        const holder = pagesRef.current;
        holder.innerHTML = '';
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.min(820, holder.clientWidth || 820);
        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          canvas.style.width = `${width}px`; canvas.style.height = `${(viewport.height / ratio)}px`;
          canvas.className = 'pdf-sheet';
          canvas.setAttribute('aria-label', `Página ${n}`);
          holder.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          if (n === 1 && !cancelled) setState('ready');
        }
      } catch (reason) {
        if (!cancelled) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o PDF.'); setState('error'); }
      }
    })();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-pdf-viewer');
      doc?.destroy?.();
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 1000);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function download() {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
  }

  function print() {
    if (!url) return;
    if (isIos()) { window.open(url, '_blank'); return; }
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed'; frame.style.right = '0'; frame.style.bottom = '0'; frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
    frame.src = url;
    frame.onload = () => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { window.open(url, '_blank'); } setTimeout(() => frame.remove(), 60_000); };
    document.body.appendChild(frame);
  }

  return <div className="pdf-viewer" role="dialog" aria-modal="true" aria-label={title}>
    <header className="pdf-viewer-bar">
      <button type="button" className="pdf-viewer-back" onClick={onClose} aria-label="Fechar">‹ <span>Voltar</span></button>
      <div className="pdf-viewer-title"><strong>{title}</strong>{pages > 0 && <small>{pages} {pages === 1 ? 'página' : 'páginas'} · como sai impresso</small>}</div>
      <div className="pdf-viewer-actions">
        <button type="button" className="pdf-viewer-button" disabled={!url} onClick={print}>Imprimir</button>
        <button type="button" className="pdf-viewer-button is-primary" disabled={!url} onClick={download}>Baixar</button>
      </div>
    </header>
    <div className="pdf-viewer-body">
      {state === 'loading' && <p className="pdf-viewer-note">Abrindo…</p>}
      {state === 'error' && <p className="pdf-viewer-note is-error">{error}</p>}
      {state === 'fallback' && url && <iframe className="pdf-viewer-frame" src={url} title={title} />}
      <div ref={pagesRef} className="pdf-viewer-pages" hidden={state === 'fallback'} />
    </div>
  </div>;
}

/** Carrega um PDF do painel (sessão do navegador). */
export async function fetchPdf(path: string): Promise<Blob> {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível gerar o PDF.');
  return response.blob();
}
