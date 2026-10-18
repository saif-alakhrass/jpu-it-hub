import { supabase } from '@/lib/supabase';

const workerUrl = (import.meta.env.VITE_R2_WORKER_URL as string | undefined)?.replace(/\/$/, '') || '';

export const isMoodleAuthEnabled = import.meta.env.VITE_MOODLE_AUTH_ENABLED === 'true';

interface MoodleLoginResponse {
  token_hash?: string;
  verification_type?: 'email';
  sync?: { courses_synced?: number; synced_at?: string };
  error?: string;
}

export interface MoodleSignInResult {
  error: string | null;
  coursesSynced: number;
}

export async function signInWithMoodle(studentId: string, password: string): Promise<MoodleSignInResult> {
  if (!workerUrl) return { error: 'خدمة تسجيل الدخول الجامعي غير مهيأة.', coursesSynced: 0 };
  try {
    const response = await fetch(`${workerUrl}/v2/auth/moodle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, password }),
    });
    const result = await response.json() as MoodleLoginResponse;
    if (!response.ok || !result.token_hash) {
      return { error: result.error || 'تعذر تسجيل الدخول من منصة الجامعة.', coursesSynced: 0 };
    }

    const { error } = await supabase.auth.verifyOtp({
      token_hash: result.token_hash,
      type: 'email',
    });
    if (error) return { error: 'تم التحقق من بيانات الجامعة، لكن تعذر بدء جلسة الموقع.', coursesSynced: 0 };
    return { error: null, coursesSynced: result.sync?.courses_synced || 0 };
  } catch {
    return { error: 'تعذر الوصول إلى خدمة تسجيل الدخول. تحقق من اتصالك وحاول مجددًا.', coursesSynced: 0 };
  }
}
