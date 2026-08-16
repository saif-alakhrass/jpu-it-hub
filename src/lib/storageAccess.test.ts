import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketStub, resetSupabaseStub, supabaseStub } from '@/test/supabaseStub';
import { downloadFile, downloadFileViaStorage, getSignedFileUrl, openFilePreview } from './storage';

vi.mock('@/lib/supabase', () => ({ supabase: supabaseStub, isSupabaseConfigured: true }));

const anchorClick = vi.fn();

beforeEach(() => {
  resetSupabaseStub();
  anchorClick.mockClear();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(anchorClick);
  URL.createObjectURL = vi.fn(() => 'blob:object-url');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getSignedFileUrl', () => {
  it('returns the signed URL for a stored object', async () => {
    bucketStub.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/notes.pdf' }, error: null });

    await expect(getSignedFileUrl('subject/notes.pdf')).resolves.toBe('https://signed/notes.pdf');
    expect(supabaseStub.storage.from).toHaveBeenCalledWith('files');
    expect(bucketStub.createSignedUrl).toHaveBeenCalledWith('subject/notes.pdf', 3600);
  });

  it('returns null when signing fails or yields no URL', async () => {
    bucketStub.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'not found' } });
    await expect(getSignedFileUrl('missing.pdf')).resolves.toBeNull();

    bucketStub.createSignedUrl.mockResolvedValue({ data: {}, error: null });
    await expect(getSignedFileUrl('missing.pdf')).resolves.toBeNull();
  });
});

describe('downloadFileViaStorage', () => {
  it('saves the downloaded blob under the fallback name', async () => {
    bucketStub.download.mockResolvedValue({ data: new Blob(['pdf']), error: null });

    await downloadFileViaStorage('subject/notes.pdf', 'notes.pdf');

    expect(bucketStub.download).toHaveBeenCalledWith('subject/notes.pdf');
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:object-url');
  });

  it('rethrows the storage error', async () => {
    const error = new Error('object missing');
    bucketStub.download.mockResolvedValue({ data: null, error });

    await expect(downloadFileViaStorage('gone.pdf', 'gone.pdf')).rejects.toBe(error);
  });

  it('throws a generic error when no data and no error come back', async () => {
    bucketStub.download.mockResolvedValue({ data: null, error: null });

    await expect(downloadFileViaStorage('gone.pdf', 'gone.pdf')).rejects.toThrow('Download failed');
  });
});

describe('downloadFile', () => {
  it('fetches the URL and saves it as a file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['pdf'])) });
    vi.stubGlobal('fetch', fetchMock);

    await downloadFile('https://r2/presigned/notes.pdf', 'notes.pdf');

    expect(fetchMock).toHaveBeenCalledWith('https://r2/presigned/notes.pdf');
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });

  it('navigates to the URL when the fetch download fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });

    await downloadFile('https://r2/expired/notes.pdf', 'notes.pdf');

    expect(assign).toHaveBeenCalledWith('https://r2/expired/notes.pdf');
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it('ignores an empty URL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await downloadFile('', 'notes.pdf');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('openFilePreview', () => {
  it('opens the file in a new tab', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    openFilePreview('https://r2/presigned/notes.pdf');

    expect(open).toHaveBeenCalledWith('https://r2/presigned/notes.pdf', '_blank');
  });
});
