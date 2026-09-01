import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileRow } from '@/lib/types';
import { MobileFileReader } from './MobileFileReader';

const pdfMocks = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfMocks.getDocument,
}));

function makeFile(overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: 'file-1',
    subject_id: 'subject-1',
    tab: 'images',
    title: 'مخطط الشبكات',
    storage_path: 'user/file.png',
    file_url: '',
    file_type: 'png',
    file_size: 1024,
    uploader_id: 'user-1',
    status: 'approved',
    created_at: '2026-08-22T00:00:00Z',
    batch_id: null,
    storage_provider: 'r2',
    object_key: 'user/file.png',
    file_hash: 'hash',
    mime_type: 'image/png',
    rejection_reason: null,
    moderated_at: null,
    moderated_by: null,
    ...overrides,
  };
}

describe('MobileFileReader', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() { this.callback([{ contentRect: { width: 400 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
      unobserve() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    const renderTask = { promise: Promise.resolve(), cancel: vi.fn() };
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({ width: 200 * scale, height: 300 * scale }),
      render: vi.fn(() => renderTask),
    };
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 3, getPage: vi.fn().mockResolvedValue(page), destroy: vi.fn() }),
    });
  });

  it('keeps preview and download as distinct actions', () => {
    const onClose = vi.fn();
    const onDownload = vi.fn();
    render(<MobileFileReader file={makeFile()} url="https://example.com/image.png" onClose={onClose} onDownload={onDownload} />);

    expect(screen.getByRole('img', { name: 'مخطط الشبكات' }).getAttribute('src')).toBe('https://example.com/image.png');
    fireEvent.click(screen.getByRole('button', { name: 'تحميل' }));
    expect(onDownload).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'إغلاق العارض' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('never sends raw Office files to an external iframe', () => {
    render(<MobileFileReader file={makeFile({ file_type: 'pptx', mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', title: 'محاضرة 1' })} url="https://example.com/slides.pptx?token=1" onClose={vi.fn()} onDownload={vi.fn()} />);

    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText('لا تتوفر معاينة لهذا النوع')).toBeDefined();
  });

  it('renders generated PDFs and supports mobile page navigation and zoom', async () => {
    render(<MobileFileReader file={makeFile({ file_type: 'pdf', mime_type: 'application/pdf', title: 'نسخة المعاينة' })} url="blob:preview-pdf" onClose={vi.fn()} onDownload={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('1 / 3')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /التالي/ }));
    await waitFor(() => expect(screen.getByText('2 / 3')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'ملاءمة العرض' }).textContent).toBe('125%'));
    fireEvent.click(screen.getByRole('button', { name: 'ملاءمة العرض' }));
    expect(screen.getByRole('button', { name: 'ملاءمة العرض' }).textContent).toBe('100%');
    fireEvent.click(screen.getByRole('button', { name: /السابق/ }));
    await waitFor(() => expect(screen.getByText('1 / 3')).toBeDefined());
  });

  it('shows a safe fallback when a PDF cannot be decoded', async () => {
    pdfMocks.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error('corrupt')) });
    render(<MobileFileReader file={makeFile({ file_type: 'pdf', mime_type: 'application/pdf' })} url="blob:broken" onClose={vi.fn()} onDownload={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('تعذّر عرض ملف PDF')).toBeDefined());
    expect(screen.getByText('PDF_LOAD')).toBeDefined();
  });
});
