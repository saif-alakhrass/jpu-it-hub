import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { FileRow } from '@/lib/types';
import { Icon } from './Icon';

interface MobileFileReaderProps {
  file: FileRow;
  url: string;
  onClose: () => void;
  onDownload: () => void;
}

function fileKind(file: FileRow): 'image' | 'pdf' | 'unsupported' {
  const extension = (file.file_type ?? '').toLowerCase();
  if ((file.mime_type ?? '').startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'image';
  if (file.mime_type === 'application/pdf' || extension === 'pdf') return 'pdf';
  return 'unsupported';
}

export function MobileFileReader({ file, url, onClose, onDownload }: MobileFileReaderProps) {
  const kind = fileKind(file);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const previous = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      Object.assign(document.body.style, previous);
      window.scrollTo(0, scrollY);
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-ink-950 text-slate-100" role="dialog" aria-modal="true" aria-label={`عرض ${file.title}`}>
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-ink-900/95 px-3 pb-2 pt-[max(.5rem,env(safe-area-inset-top))] shadow-lg shadow-black/20">
        <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-300 transition active:bg-white/10" aria-label="إغلاق العارض">
          <Icon name="X" className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold" title={file.title}>{file.title}</h2>
          <p className="text-[11px] text-slate-400">وضع القراءة</p>
        </div>
        <button onClick={onDownload} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand-500/15 px-3 text-xs font-medium text-brand-200 transition active:bg-brand-500/25">
          <Icon name="Download" className="h-4 w-4" />
          تحميل
        </button>
      </header>

      <main className="min-h-0 flex-1 bg-[#090f1c]">
        {kind === 'pdf' && <PdfReader url={url} />}
        {kind === 'image' && <ImageReader url={url} title={file.title} />}
        {kind === 'unsupported' && <UnsupportedReader onDownload={onDownload} />}
      </main>
    </div>,
    document.body,
  );
}

function PdfReader({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const pointerStartRef = useRef<number | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [hostWidth, setHostWidth] = useState(360);
  const [loading, setLoading] = useState(true);
  const [errorStage, setErrorStage] = useState<'load' | 'render' | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHostWidth(Math.max(280, entry.contentRect.width - 24));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let loadedDocument: PDFDocumentProxy | null = null;
    setLoading(true);
    setErrorStage(null);
    // The legacy build includes the runtime polyfills required by older iOS
    // Safari releases. The modern build can fail before rendering on phones
    // that do not yet provide APIs such as Promise.withResolvers.
    void import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdfjs.getDocument({ url, isEvalSupported: false }).promise;
    }).then((pdf) => {
      if (disposed) return pdf.destroy();
      loadedDocument = pdf;
      setDocument(pdf);
      setPageNumber(1);
    }).catch(() => {
      if (!disposed) setErrorStage('load');
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
      void loadedDocument?.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let disposed = false;
    setLoading(true);
    void document.getPage(pageNumber).then((page) => {
      if (disposed || !canvasRef.current) return;
      const natural = page.getViewport({ scale: 1 });
      const fitScale = hostWidth / natural.width;
      const cssViewport = page.getViewport({ scale: fitScale * zoom });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
      const renderViewport = page.getViewport({ scale: fitScale * zoom * pixelRatio });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas unavailable');
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = `${Math.floor(cssViewport.width)}px`;
      canvas.style.height = `${Math.floor(cssViewport.height)}px`;
      renderTaskRef.current?.cancel();
      const task = page.render({ canvas, canvasContext: context, viewport: renderViewport });
      renderTaskRef.current = task;
      return task.promise;
    }).catch((reason: unknown) => {
      if (!disposed && !(reason instanceof Error && reason.name === 'RenderingCancelledException')) setErrorStage('render');
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
    };
  }, [document, hostWidth, pageNumber, zoom]);

  const goToPage = (next: number) => {
    if (!document) return;
    setPageNumber(Math.min(document.numPages, Math.max(1, next)));
    hostRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };

  if (errorStage) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div><Icon name="FileWarning" className="mx-auto mb-3 h-10 w-10 text-amber-400" /><p className="font-semibold">تعذّر عرض ملف PDF</p><p className="mt-1 text-sm text-slate-400">يمكنك تنزيل الملف وفتحه من جهازك.</p><p className="mt-3 font-mono text-[10px] text-slate-600">PDF_{errorStage.toUpperCase()}</p></div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-ink-900/70 px-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom((value) => Math.max(.75, value - .25))} disabled={zoom <= .75} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 disabled:opacity-30 active:bg-white/10" aria-label="تصغير"><Icon name="ZoomOut" className="h-4 w-4" /></button>
          <button onClick={() => setZoom(1)} className="min-w-12 rounded-lg px-1 py-2 text-xs text-slate-300 active:bg-white/10" aria-label="ملاءمة العرض">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom((value) => Math.min(2.5, value + .25))} disabled={zoom >= 2.5} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 disabled:opacity-30 active:bg-white/10" aria-label="تكبير"><Icon name="ZoomIn" className="h-4 w-4" /></button>
        </div>
        <span className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs tabular-nums text-slate-300">{pageNumber} / {document?.numPages ?? '—'}</span>
      </div>

      <div
        ref={hostRef}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain p-3 [touch-action:pan-x_pan-y_pinch-zoom]"
        onPointerDown={(event) => { if (zoom === 1) pointerStartRef.current = event.clientX; }}
        onPointerUp={(event) => {
          const start = pointerStartRef.current;
          pointerStartRef.current = null;
          if (start === null || zoom !== 1) return;
          const distance = event.clientX - start;
          if (distance < -60) goToPage(pageNumber + 1);
          if (distance > 60) goToPage(pageNumber - 1);
        }}
      >
        <canvas ref={canvasRef} className="mx-auto block max-w-none rounded-sm bg-white shadow-2xl shadow-black/30" />
        {loading && <div className="absolute inset-0 grid place-items-center bg-[#090f1c]/70"><Icon name="Loader2" className="h-7 w-7 animate-spin text-brand-400" /></div>}
      </div>

      <nav className="flex shrink-0 items-center justify-center gap-3 border-t border-white/5 bg-ink-900/90 px-3 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2" aria-label="التنقل بين الصفحات">
        <button onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1} className="flex h-10 min-w-28 items-center justify-center gap-1 rounded-xl bg-white/5 text-sm disabled:opacity-30 active:bg-white/10"><Icon name="ChevronRight" className="h-4 w-4" />السابق</button>
        <button onClick={() => goToPage(pageNumber + 1)} disabled={!document || pageNumber >= document.numPages} className="flex h-10 min-w-28 items-center justify-center gap-1 rounded-xl bg-brand-500/15 text-sm text-brand-200 disabled:opacity-30 active:bg-brand-500/25">التالي<Icon name="ChevronLeft" className="h-4 w-4" /></button>
      </nav>
    </div>
  );
}

function ImageReader({ url, title }: { url: string; title: string }) {
  return (
    <div className="h-full overflow-auto overscroll-contain p-3 [touch-action:pan-x_pan-y_pinch-zoom]">
      <img src={url} alt={title} className="mx-auto block h-auto max-w-full rounded-lg object-contain shadow-2xl shadow-black/30" />
    </div>
  );
}

function UnsupportedReader({ onDownload }: { onDownload: () => void }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div><Icon name="FileText" className="mx-auto mb-3 h-10 w-10 text-brand-400" /><p className="font-semibold">لا تتوفر معاينة لهذا النوع</p><button onClick={onDownload} className="btn-primary mt-4"><Icon name="Download" className="h-4 w-4" />تحميل الملف</button></div>
    </div>
  );
}
