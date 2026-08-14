import { describe, expect, it } from 'vitest';
import { canUploadNow, formatFileSize, getFileIcon, validateFile } from './storage';
import { MAX_FILE_SIZE_BYTES } from './constants';

function fakeFile(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

describe('file validation', () => {
  it('accepts supported files within the size limit', () => {
    expect(validateFile(fakeFile('notes.pdf', 'application/pdf', 1024))).toEqual({ ok: true });
  });

  it('rejects unsupported extensions and MIME types', () => {
    expect(validateFile(fakeFile('payload.exe', 'application/octet-stream', 100)).ok).toBe(false);
    expect(validateFile(fakeFile('fake.pdf', 'application/octet-stream', 100)).ok).toBe(false);
  });

  it('rejects files larger than the configured maximum', () => {
    expect(validateFile(fakeFile('large.pdf', 'application/pdf', MAX_FILE_SIZE_BYTES + 1)).ok).toBe(false);
  });
});

describe('storage helpers', () => {
  it('formats file sizes for display', () => {
    expect(formatFileSize(900)).toBe('900 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('enforces the client-side upload window', () => {
    const now = Date.now();
    expect(canUploadNow(Array(9).fill(now), 10)).toBe(true);
    expect(canUploadNow(Array(10).fill(now), 10)).toBe(false);
    expect(canUploadNow(Array(19).fill(now), 20)).toBe(true);
    expect(canUploadNow(Array(50).fill(now), 50)).toBe(false);
  });

  it('selects an appropriate icon for every supported document family', () => {
    expect(getFileIcon('PNG')).toBe('Image');
    expect(getFileIcon('pdf')).toBe('FileText');
    expect(getFileIcon('docx')).toBe('FileType');
    expect(getFileIcon('ppt')).toBe('Presentation');
    expect(getFileIcon('zip')).toBe('File');
  });
});
