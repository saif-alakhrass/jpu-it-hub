import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserOfficeViewer } from './BrowserOfficeViewer';
import type { FileRow } from '@/lib/types';

const renderer = vi.hoisted(() => ({
  init: vi.fn(), load: vi.fn(), renderSingleSlide: vi.fn(), destroy: vi.fn(),
}));
vi.mock('pptx-preview', () => ({ init: renderer.init }));

const file = { id: 'presentation', file_type: 'pptx' } as FileRow;
const loadDocument = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() {
      this.callback([{ contentRect: { width: 326 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    disconnect() {}
  });
  renderer.load.mockResolvedValue(undefined);
  renderer.init.mockImplementation((root: HTMLElement) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'pptx-preview-wrapper';
    root.append(wrapper);
    return { ...renderer, slideCount: 3, pptx: { width: 960, height: 720 } };
  });
  loadDocument.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount() {
  return render(<div dir="rtl"><BrowserOfficeViewer file={file} loadDocument={loadDocument} onDownload={vi.fn()} onOpenExternal={vi.fn()} /></div>);
}

describe('mobile PPTX preview', () => {
  it('anchors the scaled canvas to an LTR stage inside the Arabic page', async () => {
    const { container } = mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'تكبير' }).hasAttribute('disabled')).toBe(false));
    const canvas = container.querySelector('.pptx-preview-wrapper')!.parentElement!;
    const stage = canvas.parentElement!;
    expect(stage.dir).toBe('ltr');
    expect(stage.classList.contains('relative')).toBe(true);
    expect(canvas.classList.contains('absolute')).toBe(true);
    expect(canvas.classList.contains('left-0')).toBe(true);
    expect(canvas.classList.contains('top-0')).toBe(true);
    expect(canvas.classList.contains('origin-top-left')).toBe(true);
    expect(parseFloat(stage.style.width)).toBeLessThan(326);
    expect(canvas.style.height).toBe('720px');
    expect(renderer.init).toHaveBeenCalledWith(canvas, { width: 960, height: 540, mode: 'list' });
  });

  it('switches one slide at a time and zooms without reloading the file', async () => {
    mount();
    await waitFor(() => expect(renderer.renderSingleSlide).toHaveBeenCalledWith(0));
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    expect(renderer.renderSingleSlide).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
    expect(screen.getByRole('button', { name: 'ملاءمة العرض للشاشة' }).textContent).toBe('110%');
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة السابقة' }));
    expect(renderer.renderSingleSlide).toHaveBeenLastCalledWith(0);
    expect(loadDocument).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'تصغير' }).querySelector('.lucide-minus')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'ملء الشاشة' }).querySelector('.lucide-maximize2')).not.toBeNull();
  });

  it('shows fallback actions instead of an empty stage when parsing fails', async () => {
    renderer.load.mockRejectedValue(new Error('Invalid presentation'));
    mount();
    expect(await screen.findByText('تعذر عرض هذا الملف داخل الموقع')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'فتح خارجي' })).toBeTruthy();
  });

  it('disposes the renderer when the viewer is closed', async () => {
    const { unmount } = mount();
    await waitFor(() => expect(renderer.renderSingleSlide).toHaveBeenCalledWith(0));
    act(() => unmount());
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
  });
});
