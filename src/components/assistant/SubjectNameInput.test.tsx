import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SubjectNameInput } from './SubjectNameInput';
import type { Subject } from '@/lib/types';
afterEach(cleanup);
const subjects = [
  {
    id: 'advanced',
    name: 'البرمجة المتقدمة',
    code: 'CS201',
    major: 'علم الحاسوب',
  },
  {
    id: 'oop',
    name: 'البرمجة الكينونية المتقدمة',
    code: 'CS202',
    major: 'علم الحاسوب',
  },
] as Subject[];
function Demo() {
  const [data, setData] = useState<{ name: string; subjectId: string | null }>({
    name: '',
    subjectId: null,
  });
  return (
    <>
      <SubjectNameInput
        id="course"
        value={data.name}
        subjects={subjects}
        onChange={setData}
      />
      <output aria-label="المطابقة">{data.subjectId ?? 'none'}</output>
    </>
  );
}
describe('instant subject name input', () => {
  it('auto-links non-literal full names without changing typed text or focus', () => {
    render(<Demo />);
    const input = screen.getByRole('combobox', { name: 'اسم المادة' });
    input.focus();
    fireEvent.change(input, { target: { value: 'برمجه متقدمه' } });
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe('برمجه متقدمه');
    expect(screen.getByLabelText('المطابقة').textContent).toBe('advanced');
    fireEvent.change(input, { target: { value: 'مادة خاصة جديدة' } });
    expect(screen.getByLabelText('المطابقة').textContent).toBe('none');
  });
  it('shows partial alternatives and allows keyboard selection and escape', () => {
    render(<Demo />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'متقدمه' } });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByLabelText('المطابقة').textContent).toBe('none');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((input as HTMLInputElement).value).toBe(
      'البرمجة الكينونية المتقدمة',
    );
    expect(screen.getByLabelText('المطابقة').textContent).toBe('oop');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('supports selecting an alternative with a pointer', () => {
    render(<Demo />);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'متقدمه' },
    });
    fireEvent.click(screen.getByRole('option', { name: /الكينونية/ }));
    expect(screen.getByLabelText('المطابقة').textContent).toBe('oop');
  });
});
