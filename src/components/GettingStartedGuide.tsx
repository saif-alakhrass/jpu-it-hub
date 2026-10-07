import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import {
  GETTING_STARTED_VIDEO_URL,
  isNewAccount,
  MAX_PROMPT_SESSIONS,
} from '@/lib/gettingStartedGuide';
const STORAGE_PREFIX = 'jpu-it-hub:getting-started-guide:';
const SESSION_PREFIX = 'jpu-it-hub:getting-started-guide-session:';

interface GuideState {
  completed: boolean;
  impressions: number;
}

function readGuideState(userId: string): GuideState {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!value) return { completed: false, impressions: 0 };
    const parsed = JSON.parse(value) as Partial<GuideState>;
    return {
      completed: parsed.completed === true,
      impressions: Number.isFinite(parsed.impressions)
        ? Math.max(0, Number(parsed.impressions))
        : 0,
    };
  } catch {
    return { completed: false, impressions: 0 };
  }
}

function writeGuideState(userId: string, state: GuideState) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(state));
  } catch {
    // The prompt is optional; restricted storage must never affect the app.
  }
}

export function GettingStartedGuide() {
  const { session, loading } = useAuth();
  const [visible, setVisible] = useState(false);
  const userId = session?.user.id;

  useEffect(() => {
    if (loading || !userId || !isNewAccount(session.user.created_at)) {
      setVisible(false);
      return;
    }

    const state = readGuideState(userId);
    if (state.completed || state.impressions >= MAX_PROMPT_SESSIONS) {
      setVisible(false);
      return;
    }

    const sessionKey = `${SESSION_PREFIX}${userId}`;
    let nextState = state;
    try {
      if (!sessionStorage.getItem(sessionKey)) {
        nextState = { ...state, impressions: state.impressions + 1 };
        sessionStorage.setItem(sessionKey, '1');
        writeGuideState(userId, nextState);
      }
    } catch {
      // Show once without persistence when browser storage is unavailable.
    }

    setVisible(nextState.impressions <= MAX_PROMPT_SESSIONS);
  }, [loading, session, userId]);

  if (!visible || !userId) return null;

  function markCompleted() {
    writeGuideState(userId!, { completed: true, impressions: MAX_PROMPT_SESSIONS });
    setVisible(false);
  }

  return (
    <aside
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-[0_20px_55px_rgba(15,53,92,0.2)] sm:right-auto"
      aria-label="شرح استخدام الموقع"
    >
      <div className="h-1 bg-gradient-to-l from-brand-400 via-sky-400 to-cyan-300" />
      <div className="relative flex items-start gap-3 p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Icon name="PlayCircle" className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="mb-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">ابدأ من هنا</span>
          <h2 className="text-sm font-extrabold text-slate-100">جديد في JPU-IT Hub؟</h2>
          <p className="mt-1 text-xs leading-6 text-slate-500">شاهد شرحًا سريعًا للبحث عن الملفات وعرضها وتحميلها ورفع مشاركتك.</p>
          <a
            href={GETTING_STARTED_VIDEO_URL}
            target="_blank"
            rel="noreferrer"
            onClick={markCompleted}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <Icon name="PlayCircle" className="h-4 w-4" />
            مشاهدة شرح الموقع
          </a>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          aria-label="إغلاق شرح الموقع"
        >
          <Icon name="X" className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
