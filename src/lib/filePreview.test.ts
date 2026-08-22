import { describe, expect, it } from 'vitest';
import { mobileOfficePreviewUrl, officePreviewUrl, shouldUseFullPagePreview } from './filePreview';

describe('Office file preview', () => {
  it('uses the full-page viewer on phones and touch-first tablets', () => {
    expect(shouldUseFullPagePreview(390, 5)).toBe(true);
    expect(shouldUseFullPagePreview(1024, 5)).toBe(true);
    expect(shouldUseFullPagePreview(1440, 0)).toBe(false);
  });

  it('builds distinct embedded and full-page Office viewer URLs', () => {
    const signedUrl = 'https://example.com/file.pptx?signature=a&expires=1';
    expect(officePreviewUrl(signedUrl, true)).toContain('/op/embed.aspx?src=');
    expect(officePreviewUrl(signedUrl, false)).toContain('/op/view.aspx?src=');
    expect(officePreviewUrl(signedUrl, false)).toContain(encodeURIComponent(signedUrl));
  });

  it('uses the Google document viewer for touch-device Office previews', () => {
    const signedUrl = 'https://example.com/file.pptx?signature=a&expires=1';
    expect(mobileOfficePreviewUrl(signedUrl)).toBe(
      `https://docs.google.com/gview?url=${encodeURIComponent(signedUrl)}`,
    );
  });
});
