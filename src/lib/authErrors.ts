/*
 * Maps Supabase auth errors (and thrown network/config failures) to
 * human-readable Arabic messages. Used by both signIn and signUp so
 * the error banner always shows a string, never a raw object like `{}`.
 */

const AUTH_ERROR_MAP: { match: RegExp; message: string }[] = [
  { match: /already registered|already been registered|user already exists/i, message: 'هذا البريد الإلكتروني مسجل بالفعل. سجّل الدخول أو استخدم بريداً آخر.' },
  { match: /password.*(?:at least|6 char|weak|should be|too short)/i, message: 'كلمة المرور ضعيفة. يجب أن تكون 6 أحرف على الأقل.' },
  { match: /unable to validate email|invalid email|email not provided|email required|provide an email/i, message: 'يرجى إدخال بريد إلكتروني صحيح.' },
  { match: /password not provided|password required|provide a password|missing password/i, message: 'يرجى إدخال كلمة المرور.' },
  { match: /email not confirmed/i, message: 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول.' },
  { match: /invalid login credentials|invalid credentials/i, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' },
  { match: /user not found/i, message: 'لا يوجد حساب مرتبط بهذا البريد الإلكتروني.' },
  { match: /rate limit|rate_limit|too many requests|over_request_send_rate|for security purposes/i, message: 'لقد تجاوزت عدد المحاولات المسموح. حاول مرة أخرى بعد قليل.' },
  { match: /fetch failed|failed to fetch|networkerror|network request failed|offline|err_internet/i, message: 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.' },
  { match: /timeout|timed out|aborted/i, message: 'انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.' },
];

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.error_description === 'string' && e.error_description) return e.error_description;
    if (typeof e.error === 'string' && e.error) return e.error;
    if (typeof e.msg === 'string' && e.msg) return e.msg;
  }
  if (error instanceof Error) return error.message;
  return '';
}

export function mapAuthError(error: unknown, fallback = 'حدث خطأ أثناء إنشاء الحساب'): string {
  const raw = extractMessage(error);
  for (const { match, message } of AUTH_ERROR_MAP) {
    if (match.test(raw)) return message;
  }
  return raw || fallback;
}
