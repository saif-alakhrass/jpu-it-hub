import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GPACalculatorTab } from './GPACalculatorTab';
import {
  emptySemester,
  newCourse,
  type StudentSemester,
} from '@/lib/studentAssistant';

afterEach(cleanup);
function Harness({ initial }: { initial: StudentSemester }) {
  const [data, setData] = useState(initial);
  return <GPACalculatorTab data={data} onChange={setData} subjects={[]} />;
}
const initial = {
  ...emptySemester(),
  previousHours: '30',
  previousAverage: '75',
  target: '84',
  courses: [{ ...newCourse(), grade: '90' }],
};
describe('separate current-semester and graduation planning', () => {
  it('keeps the original calculator and shows the future scenario only when selected', () => {
    render(<Harness initial={initial} />);
    expect(
      screen.queryByRole('heading', { name: 'كم فصل أحتاج للوصول لهدفي؟' }),
    ).toBeNull();
    expect(
      screen.getByText(/لا يمكن بلوغ هذا الهدف في الفصل الحالي/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'حتى التخرج', hidden: true }),
    );
    expect(
      screen.queryByText(/لا يمكن بلوغ هذا الهدف في الفصل الحالي/),
    ).toBeNull();
    expect(screen.getByText(/تصل للهدف خلال/).textContent).toContain('3');
    expect(screen.queryByLabelText('إجمالي ساعات خطة التخصص')).toBeNull();
    expect(screen.getByText('خطة التخصص · 132 ساعة')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('ساعات كل فصل قادم'), {
      target: { value: '9' },
    });
    expect(screen.getByText(/تصل للهدف خلال/).textContent).toContain('5');
    fireEvent.click(
      screen.getByRole('button', { name: 'هذا الفصل', hidden: true }),
    );
    expect(
      screen.getByText(/لا يمكن بلوغ هذا الهدف في الفصل الحالي/),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText('العلامة المتوقعة') as HTMLInputElement).value,
    ).toBe('90');
    fireEvent.click(
      screen.getByRole('button', { name: 'حتى التخرج', hidden: true }),
    );
    expect(
      (screen.getByLabelText('ساعات كل فصل قادم') as HTMLInputElement).value,
    ).toBe('9');
  });
  it('shows the user example honestly and keeps focus while editing', () => {
    render(
      <Harness
        initial={{
          ...initial,
          previousHours: '88',
          previousAverage: '60',
          target: '90',
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'حتى التخرج', hidden: true }),
    );
    expect(
      screen.getByText(/هذا الهدف غير ممكن ضمن الساعات المتبقية/),
    ).toBeTruthy();
    expect(
      screen.getByText(/أعلى تراكمي عند إكمال الخطة/).textContent,
    ).toContain('73.33%');
    const input = screen.getByLabelText('المعدل المتوقع لكل فصل (%)');
    // Open the parent disclosure before checking actual browser focus behavior.
    const details = input.closest('details')!;
    details.open = true;
    input.focus();
    fireEvent.change(input, { target: { value: '95' } });
    expect(document.activeElement).toBe(input);
  });
});
