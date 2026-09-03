import { calculateGpa, classifyAverage } from './gpaEngine';
import type { StudentSemester } from './studentAssistant';

export async function renderSemesterCard(data: StudentSemester): Promise<Blob> {
  await document.fonts.ready;
  const results = calculateGpa(data);
  const width = 1000;
  const height = 540 + data.courses.length * 66;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر تجهيز الصورة على هذا المتصفح.');
  ctx.fillStyle = '#f4f8fc';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(24, 24, width - 48, height - 48);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  const text = (
    value: string,
    x: number,
    y: number,
    size = 24,
    color = '#263551',
    maxWidth = 870,
  ) => {
    ctx.font = `500 ${size}px "IBM Plex Sans Arabic", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, maxWidth);
  };
  text('JPU-IT Hub · بطاقة الفصل', 940, 90, 34, '#1e3a8a');
  text(data.name || 'فصلي الدراسي', 940, 142, 28);
  text(data.major || 'التخصص غير محدد', 940, 184, 22, '#66758b');
  text(
    `ساعات الفصل: ${results.semesterHours}  ·  عدد المواد: ${data.courses.length}`,
    940,
    242,
  );
  text(
    `التراكمي المتوقع: ${results.cumulative === null ? 'غير مكتمل' : `${results.cumulative.toFixed(2)}% — ${classifyAverage(results.cumulative).label}`}`,
    940,
    294,
    26,
    '#1e3a8a',
  );
  text(
    `المعدل الفصلي المتوقع: ${results.semester === null ? 'غير مكتمل' : `${results.semester.toFixed(2)}%`}`,
    940,
    340,
    26,
    '#1e3a8a',
  );
  text('مواد الفصل', 940, 394, 26);
  let y = 445;
  for (const c of data.courses) {
    ctx.fillStyle = '#eff6ff';
    ctx.fillRect(60, y - 32, 880, 54);
    text(c.name || 'مادة بدون اسم', 920, y, 24, '#263551', 650);
    text(`${c.hours || '—'} ساعات`, 230, y, 21, '#1e3a8a', 145);
    y += 66;
  }
  text(
    'محاكاة شخصية وليست كشف علامات رسميًا · jpu-it-hub.fyi',
    940,
    height - 44,
    18,
    '#66758b',
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('تعذر تصدير الصورة.')),
      'image/png',
    ),
  );
}
