import { describe, expect, it } from 'vitest';
import { isImageFile, isImageType, isOfficeType, isPdfFile, isPdfType, officePreviewUrl } from './fileTypes';

describe('extension classifiers', () => {
  it('matches case-insensitively and rejects unknown values', () => {
    expect(isImageType('PNG')).toBe(true);
    expect(isImageType('pdf')).toBe(false);
    expect(isPdfType('PDF')).toBe(true);
    expect(isOfficeType('pptx')).toBe(true);
    expect(isOfficeType(null)).toBe(false);
  });
});

describe('file row classifiers', () => {
  it('prefers the mime type when present', () => {
    expect(isImageFile({ mime_type: 'image/heic', file_type: 'heic' })).toBe(true);
    expect(isPdfFile({ mime_type: 'application/pdf', file_type: null })).toBe(true);
    expect(isPdfFile({ mime_type: null, file_type: 'pdf' })).toBe(true);
    expect(isImageFile({ mime_type: null, file_type: 'docx' })).toBe(false);
  });
});

describe('officePreviewUrl', () => {
  it('encodes the source url', () => {
    expect(officePreviewUrl('https://cdn.test/a b.docx?x=1')).toBe(
      'https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fcdn.test%2Fa%20b.docx%3Fx%3D1',
    );
  });
});
