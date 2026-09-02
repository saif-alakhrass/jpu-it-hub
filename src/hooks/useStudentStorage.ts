import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import {
  emptySemester,
  parseSemester,
  STUDENT_STORAGE_KEY,
  type StudentSemester,
} from '@/lib/studentAssistant';

export function useStudentStorage() {
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(STUDENT_STORAGE_KEY);
      return { data: raw ? parseSemester(raw) : emptySemester(), error: '' };
    } catch {
      return {
        data: emptySemester(),
        error: 'تعذر قراءة البيانات المحلية. لن نستبدلها حتى تعدّل المدخلات.',
      };
    }
  });
  const [data, setData] = useState(initial.data);
  const [error, setError] = useState(initial.error);
  const latest = useRef(data);
  const dirty = useRef(false);
  const update = useCallback((next: SetStateAction<StudentSemester>) => {
    // Update the ref synchronously so pagehide cannot miss the last keystroke.
    const value = typeof next === 'function' ? next(latest.current) : next;
    latest.current = value;
    dirty.current = true;
    setData(value);
  }, []);
  const save = useCallback(() => {
    if (!dirty.current) return;
    try {
      localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(latest.current));
      dirty.current = false;
      setError('');
    } catch {
      setError(
        'تعذر الحفظ على هذا الجهاز. قد تكون المساحة ممتلئة أو التخزين محظورًا؛ لا تغلق الصفحة قبل حفظ بطاقتك.',
      );
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(save, 300);
    return () => window.clearTimeout(timer);
  }, [data, save]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      save();
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [save]);
  return { data, update, error };
}
