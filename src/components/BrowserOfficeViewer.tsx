import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { clampOfficeZoom, getBrowserOfficePreviewKind } from '@/lib/filePreview';
import type { FileRow } from '@/lib/types';

const PPTX_WIDTH = 960;
const PPTX_HEIGHT = 540;

interface PptxPreviewerHandle {
  slideCount?: number;
  pptx?: { width?: number; height?: number };
  load: (file: ArrayBuffer) => Promise<unknown>;
  renderSingleSlide: (index: number) => void;
  destroy: () => void;
}

interface BrowserOfficeViewerProps {
  file: FileRow;
  loadDocument: (file: FileRow) => Promise<Blob | undefined>;
  onDownload: () => void;
  onOpenExternal: () => void;
}

export function BrowserOfficeViewer({ file, loadDocument, onDownload, onOpenExternal }: BrowserOfficeViewerProps) {
  const kind = getBrowserOfficePreviewKind(file.file_type);
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const pptxRef = useRef<PptxPreviewerHandle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pptxHeight, setPptxHeight] = useState(PPTX_HEIGHT);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry?.contentRect.width ?? 0));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const root = documentRef.current;
    setStatus('loading');
    setPage(1);
    setPageCount(1);
    setZoom(100);
    setPptxHeight(PPTX_HEIGHT);
    root?.replaceChildren();

    async function renderDocument() {
      if (!root || !kind) throw new Error('Unsupported browser preview type');
      const blob = await loadDocument(file);
      if (cancelled) return;
      if (!blob) throw new Error('Document download failed');

      if (kind === 'pptx') {
        const [{ init }] = await Promise.all([
          import('pptx-preview'),
          // Give React a frame to paint the loading state before PPTX parsing.
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        ]);
        if (cancelled) return;
        // Render one slide in normal flow; slide mode vertically centers against
        // a fixed 16:9 viewport and clips presentations with other aspect ratios.
        const previewer = init(root, { width: PPTX_WIDTH, height: PPTX_HEIGHT, mode: 'list' }) as PptxPreviewerHandle;
        pptxRef.current = previewer;
        await previewer.load(await blob.arrayBuffer());
        if (cancelled) {
          previewer.destroy();
          return;
        }
        const sourceWidth = previewer.pptx?.width;
        const sourceHeight = previewer.pptx?.height;
        const naturalHeight = sourceWidth && sourceHeight
          ? Math.round(PPTX_WIDTH * sourceHeight / sourceWidth)
          : PPTX_HEIGHT;
        const wrapper = root.querySelector<HTMLElement>('.pptx-preview-wrapper');
        wrapper?.style.setProperty('height', `${naturalHeight}px`);
        wrapper?.style.setProperty('overflow', 'hidden');
        setPptxHeight(naturalHeight);
        previewer.renderSingleSlide(0);
        setPageCount(Math.max(1, previewer.slideCount ?? 1));
      } else {
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        await renderAsync(blob, root, root, {
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderChanges: false,
          renderComments: false,
          useBase64URL: true,
        });
        if (cancelled) return;
        const pages = root.querySelectorAll('section.docx');
        setPageCount(Math.max(1, pages.length));
      }
      setStatus('ready');
    }

    void renderDocument().catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
      pptxRef.current?.destroy();
      pptxRef.current = null;
      root?.replaceChildren();
    };
  }, [file, kind, loadDocument]);

  const goToPage = useCallback((requestedPage: number) => {
    if (status !== 'ready') return;
    const nextPage = Math.min(pageCount, Math.max(1, requestedPage));
    if (kind === 'pptx') {
      pptxRef.current?.renderSingleSlide(nextPage - 1);
    } else {
      const target = documentRef.current?.querySelectorAll<HTMLElement>('section.docx')[nextPage - 1];
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setPage(nextPage);
  }, [kind, pageCount, status]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') goToPage(page + 1);
      if (event.key === 'ArrowRight') goToPage(page - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goToPage, page]);

  const fitScale = useMemo(() => {
    if (kind !== 'pptx' || viewportWidth <= 0) return 1;
    return Math.min(1, Math.max(0.2, (viewportWidth - 24) / PPTX_WIDTH));
  }, [kind, viewportWidth]);
  const pptxScale = fitScale * (zoom / 100);

  async function toggleFullscreen() {
    const element = viewerRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await element.requestFullscreen();
    } catch {
      // iPhone Safari does not expose fullscreen for ordinary HTML elements.
      // The viewer remains usable in its full-height modal in that case.
    }
  }

  return (
    <div ref={viewerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-950">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-ink-600 bg-white p-2.5 sm:justify-between">
        <div className="flex h-11 items-center overflow-hidden rounded-xl border border-ink-600 bg-ink-950" dir="ltr">
          <button type="button" className="office-viewer-control" onClick={() => goToPage(page - 1)} disabled={status !== 'ready' || page <= 1} aria-label="الصفحة السابقة" title="السابق">
            <Icon name="ChevronLeft" className="h-5 w-5" />
          </button>
          <span className="min-w-16 border-x border-ink-600 px-2 text-center text-sm font-bold tabular-nums text-slate-200" aria-live="polite">{page} / {pageCount}</span>
          <button type="button" className="office-viewer-control" onClick={() => goToPage(page + 1)} disabled={status !== 'ready' || page >= pageCount} aria-label="الصفحة التالية" title="التالي">
            <Icon name="ChevronRight" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2" dir="ltr">
          <div className="flex h-11 items-center overflow-hidden rounded-xl border border-brand-200 bg-brand-50">
            <button type="button" className="office-viewer-control" onClick={() => setZoom((value) => clampOfficeZoom(value - 10))} disabled={status !== 'ready' || zoom <= 50} aria-label="تصغير" title="تصغير">
              <Icon name="Minus" className="h-5 w-5" />
            </button>
            <button type="button" className="office-viewer-control w-auto min-w-16 border-x border-brand-200 px-2 text-sm font-bold tabular-nums" onClick={() => setZoom(100)} disabled={status !== 'ready'} aria-label="ملاءمة العرض للشاشة" title="ملاءمة الشاشة">
              {zoom}%
            </button>
            <button type="button" className="office-viewer-control" onClick={() => setZoom((value) => clampOfficeZoom(value + 10))} disabled={status !== 'ready' || zoom >= 200} aria-label="تكبير" title="تكبير">
              <Icon name="Plus" className="h-5 w-5" />
            </button>
          </div>
          <button type="button" className="office-viewer-control flex w-auto min-w-11 gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 text-sm font-bold" onClick={() => void toggleFullscreen()} aria-label="ملء الشاشة" title="ملء الشاشة">
            <Icon name="Maximize2" className="h-5 w-5" />
            <span className="hidden sm:inline">ملء الشاشة</span>
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-[18rem] flex-1 overflow-auto overscroll-contain bg-black/30 p-3"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y pinch-zoom' }}
        onClickCapture={(event) => {
          const anchor = event.target instanceof Element ? event.target.closest('a') : null;
          if (anchor) event.preventDefault();
        }}
      >
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/90 text-center">
            <div>
              <Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" />
              <p className="mt-3 text-sm font-bold text-slate-200">جاري تجهيز المعاينة على جهازك…</p>
              <p className="mt-1 text-xs text-slate-500">قد يستغرق الملف الكبير بضع ثوانٍ أول مرة.</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/95 p-6 text-center">
            <div>
              <Icon name="FileWarning" className="mx-auto h-10 w-10 text-accent-400" />
              <p className="mt-3 font-bold text-slate-100">تعذر عرض هذا الملف داخل الموقع</p>
              <p className="mt-1 text-sm text-slate-400">قد يحتوي الملف على عناصر غير مدعومة. يمكنك فتحه خارجيًا أو تنزيل النسخة الأصلية.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className="btn-ghost" onClick={onOpenExternal}><Icon name="ExternalLink" className="h-4 w-4" /> فتح خارجي</button>
                <button type="button" className="btn-primary" onClick={onDownload}><Icon name="Download" className="h-4 w-4" /> تحميل الملف</button>
              </div>
            </div>
          </div>
        )}

        {kind === 'pptx' ? (
          <div dir="ltr" className="relative mx-auto" style={{ width: PPTX_WIDTH * pptxScale, height: pptxHeight * pptxScale }}>
            <div
              ref={documentRef}
              className="absolute left-0 top-0 origin-top-left overflow-hidden bg-white shadow-2xl"
              style={{ width: PPTX_WIDTH, height: pptxHeight, transform: `scale(${pptxScale})` }}
            />
          </div>
        ) : (
          <div
            ref={documentRef}
            className="browser-docx-viewer mx-auto origin-top"
            style={{ zoom: zoom / 100 }}
          />
        )}
      </div>
    </div>
  );
}
