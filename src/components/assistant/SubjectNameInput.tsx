import { useMemo, useRef, useState } from 'react';
import { matchSubject, searchSubjects } from '@/lib/subjectSearch';
import type { Subject } from '@/lib/types';

export function SubjectNameInput({
  id,
  value,
  subjects,
  onChange,
}: {
  id: string;
  value: string;
  subjects: Subject[];
  onChange: (patch: { name: string; subjectId: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(
    () => searchSubjects(subjects, value),
    [subjects, value],
  );
  const options = matches.slice(0, 8);
  const expanded = open && options.length > 0;
  const listId = `subject-results-${id}`;
  function select(subject: Subject) {
    onChange({ name: subject.name, subjectId: subject.id });
    input.current?.focus();
    setOpen(false);
    setActive(-1);
  }
  return (
    <div className="assistant-subject-search">
      <label className="assistant-field" htmlFor={`subject-name-${id}`}>
        اسم المادة
      </label>
      <input
        ref={input}
        id={`subject-name-${id}`}
        className="input"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded && active >= 0 && options[active]
            ? `${listId}-${active}`
            : undefined
        }
        maxLength={160}
        value={value}
        placeholder="مثلاً: برمجه متقدمه"
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onChange={(e) => {
          onChange({
            name: e.target.value,
            subjectId: matchSubject(e.target.value, subjects),
          });
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (
            (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
            options.length
          ) {
            e.preventDefault();
            setOpen(true);
            setActive((previous) =>
              e.key === 'ArrowDown'
                ? (previous + 1) % options.length
                : previous <= 0
                  ? options.length - 1
                  : previous - 1,
            );
          } else if (
            e.key === 'Enter' &&
            expanded &&
            active >= 0 &&
            options[active]
          ) {
            e.preventDefault();
            select(options[active]!);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label="مواد مطابقة"
          className="assistant-subject-results"
        >
          {options.map((subject, index) => (
            <li
              key={subject.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={active === index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(subject)}
            >
              <span>{subject.name}</span>
              <small>
                {subject.code ? `${subject.code} · ` : ''}
                {subject.major}
              </small>
            </li>
          ))}
        </ul>
      )}
      {open && matches.length > 1 && !matchSubject(value, subjects) && (
        <p className="assistant-match-hint">
          أكثر من مادة مطابقة؛ اختر الاسم الصحيح أو أكمل الكتابة.
        </p>
      )}
    </div>
  );
}
