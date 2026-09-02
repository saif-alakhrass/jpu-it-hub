import { afterEach, expect, it, vi } from 'vitest';
import { renderSemesterCard } from './semesterCard';
import { emptySemester, newCourse } from './studentAssistant';
afterEach(() => vi.restoreAllMocks());
it('renders a bounded local PNG including the student data and disclaimer', async () => {
  const fillText = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillText,
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  let pixels = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
  ) {
    pixels = this.width * this.height;
    callback(new Blob(['png'], { type: 'image/png' }));
  });
  const blob = await renderSemesterCard({
    ...emptySemester(),
    name: 'سيف',
    courses: Array.from({ length: 30 }, () => ({
      ...newCourse(),
      name: 'برمجة',
      grade: '90',
    })),
  });
  expect(blob.type).toBe('image/png');
  expect(pixels).toBeLessThan(4_000_000);
  expect(fillText.mock.calls.some((args) => args[0] === 'سيف')).toBe(true);
  expect(
    fillText.mock.calls.some((args) =>
      String(args[0]).includes('ليست كشف علامات رسميًا'),
    ),
  ).toBe(true);
});
