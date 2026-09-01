import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileRow } from '@/lib/types';
import { MobileFileReader } from './MobileFileReader';

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
});
