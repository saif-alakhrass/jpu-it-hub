export interface MoodleAuthEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  MOODLE_BASE_URL?: string;
  MOODLE_SERVICE_NAME?: string;
  ACADEMIC_AUTH_ENABLED?: string;
}

interface MoodleTokenResponse {
  token?: string;
  error?: string;
  errorcode?: string;
}

interface MoodleSiteInfo {
  userid?: number;
  username?: string;
  fullname?: string;
  userpictureurl?: string;
  userissiteadmin?: boolean;
  functions?: Array<{ name?: string }>;
  errorcode?: string;
}

interface MoodleUser {
  id?: number;
  username?: string;
  email?: string;
}

export interface MoodleCourse {
  id: number;
  shortname?: string;
  fullname: string;
  startdate?: number;
  enddate?: number;
  visible?: number;
}

interface MoodleLoginBody {
  student_id?: string;
  password?: string;
}

interface SupabaseUserResponse {
  id?: string;
  email?: string;
}

interface GenerateLinkResponse {
  hashed_token?: string;
  properties?: {
    hashed_token?: string;
  };
}

export interface AcademicLoginResult {
  token_hash: string;
  verification_type: 'email';
  sync: {
    courses_synced: number;
    synced_at?: string;
  };
}

export interface AcademicLinkResult {
  sync: AcademicLoginResult['sync'];
}

export class AcademicAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 12_000;
const PROVIDER = 'moodle';

export function normalizeStudentId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9._-]{3,64}$/.test(normalized) ? normalized : null;
}

export function normalizeMoodleCourses(value: unknown): MoodleCourse[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<number, MoodleCourse>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const course = item as Partial<MoodleCourse>;
    if (!Number.isSafeInteger(course.id) || typeof course.fullname !== 'string' || !course.fullname.trim()) continue;
    unique.set(course.id as number, {
      id: course.id as number,
      fullname: course.fullname.trim(),
      shortname: typeof course.shortname === 'string' ? course.shortname.trim() : undefined,
      startdate: safeUnixTimestamp(course.startdate),
      enddate: safeUnixTimestamp(course.enddate),
      visible: course.visible === 0 ? 0 : 1,
    });
  }
  return [...unique.values()];
}

function safeUnixTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function configuredMoodleBaseUrl(env: MoodleAuthEnv): string {
  if (env.ACADEMIC_AUTH_ENABLED !== 'true') {
    throw new AcademicAuthError(404, 'ACADEMIC_AUTH_DISABLED', 'تسجيل الدخول الجامعي غير مفعّل بعد.');
  }
  if (!env.MOODLE_BASE_URL) {
    throw new AcademicAuthError(503, 'MOODLE_NOT_CONFIGURED', 'بوابة الجامعة غير مهيأة حاليًا.');
  }
  const url = new URL(env.MOODLE_BASE_URL);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new AcademicAuthError(503, 'MOODLE_INSECURE_URL', 'بوابة الجامعة غير مهيأة بشكل آمن.');
  }
  return url.toString().replace(/\/$/, '');
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new AcademicAuthError(504, 'UPSTREAM_UNAVAILABLE', 'تعذر الوصول إلى الخدمة المطلوبة حاليًا.');
  } finally {
    clearTimeout(timer);
  }
}

async function readJson<T>(response: Response, code: string): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new AcademicAuthError(502, code, 'استلمنا استجابة غير صالحة من الخدمة المطلوبة.');
  }
}

function serviceHeaders(env: MoodleAuthEnv): Headers {
  return new Headers({
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  });
}

async function rpc<T>(env: MoodleAuthEnv, name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetchWithTimeout(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new AcademicAuthError(503, 'ACADEMIC_DATABASE_ERROR', 'تعذر تجهيز الحساب حاليًا.');
  return await readJson<T>(response, 'ACADEMIC_DATABASE_RESPONSE_INVALID');
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function enforceLoginRateLimit(env: MoodleAuthEnv, request: Request, studentId: string): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const keyHash = await sha256(`${ip}:${studentId}`);
  const allowed = await rpc<boolean>(env, 'academic_check_login_rate_limit', {
    p_key_hash: keyHash,
    p_limit: 8,
    p_window_seconds: 600,
  });
  if (!allowed) throw new AcademicAuthError(429, 'TOO_MANY_ATTEMPTS', 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.');
}

async function callMoodle<T>(baseUrl: string, token: string, wsfunction: string, params: Record<string, string> = {}): Promise<T> {
  const body = new URLSearchParams({
    wstoken: token,
    wsfunction,
    moodlewsrestformat: 'json',
    ...params,
  });
  const response = await fetchWithTimeout(`${baseUrl}/webservice/rest/server.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new AcademicAuthError(502, 'MOODLE_UNAVAILABLE', 'تعذر الاتصال بمنصة الجامعة.');
  const data = await readJson<T & { exception?: string; errorcode?: string }>(response, 'MOODLE_RESPONSE_INVALID');
  if (data.exception || data.errorcode) {
    throw new AcademicAuthError(502, 'MOODLE_API_ERROR', 'تعذر جلب البيانات الأكاديمية من منصة الجامعة.');
  }
  return data;
}

async function authenticateMoodle(env: MoodleAuthEnv, studentId: string, password: string) {
  const baseUrl = configuredMoodleBaseUrl(env);
  const response = await fetchWithTimeout(`${baseUrl}/login/token.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: studentId,
      password,
      service: env.MOODLE_SERVICE_NAME || 'moodle_mobile_app',
    }),
  });
  if (!response.ok) throw new AcademicAuthError(502, 'MOODLE_UNAVAILABLE', 'تعذر الاتصال بمنصة الجامعة.');
  const tokenResult = await readJson<MoodleTokenResponse>(response, 'MOODLE_RESPONSE_INVALID');
  if (!tokenResult.token) {
    throw new AcademicAuthError(401, 'INVALID_CREDENTIALS', 'الرقم الجامعي أو كلمة المرور غير صحيحة.');
  }

  const site = await callMoodle<MoodleSiteInfo>(baseUrl, tokenResult.token, 'core_webservice_get_site_info');
  if (!site.userid || !site.fullname) {
    throw new AcademicAuthError(502, 'INVALID_MOODLE_PROFILE', 'لم ترجع منصة الجامعة ملفًا شخصيًا صالحًا.');
  }
  const availableFunctions = new Set((site.functions || []).map((item) => item.name));
  if (availableFunctions.size > 0 && !availableFunctions.has('core_enrol_get_users_courses')) {
    throw new AcademicAuthError(503, 'MOODLE_COURSES_UNAVAILABLE', 'خدمة مواد الطالب غير مفعّلة في منصة الجامعة.');
  }
  const courses = normalizeMoodleCourses(await callMoodle<unknown>(
    baseUrl,
    tokenResult.token,
    'core_enrol_get_users_courses',
    { userid: String(site.userid) },
  ));

  let verifiedEmail: string | null = null;
  if (site.username && availableFunctions.has('core_user_get_users_by_field')) {
    const users = await callMoodle<MoodleUser[]>(
      baseUrl,
      tokenResult.token,
      'core_user_get_users_by_field',
      { field: 'username', 'values[0]': site.username },
    );
    const matchingUser = Array.isArray(users)
      ? users.find((user) => user.id === site.userid && user.username === site.username)
      : undefined;
    if (matchingUser?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(matchingUser.email)) {
      verifiedEmail = matchingUser.email.trim().toLowerCase();
    }
  }

  return { site, courses, verifiedEmail };
}

function syntheticEmail(providerUserId: string): string {
  return `moodle-${providerUserId}@users.jpu-it-hub.invalid`;
}

async function createSupabaseUser(env: MoodleAuthEnv, email: string, fullName: string): Promise<string> {
  const response = await fetchWithTimeout(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName, academic_provider: PROVIDER },
    }),
  });
  const user = await readJson<SupabaseUserResponse>(response, 'ACCOUNT_RESPONSE_INVALID');
  if (!response.ok || !user.id) throw new AcademicAuthError(503, 'ACCOUNT_CREATION_FAILED', 'تعذر إنشاء حساب الموقع.');
  return user.id;
}

export function extractGeneratedTokenHash(result: GenerateLinkResponse): string | null {
  const hash = result.hashed_token || result.properties?.hashed_token;
  return typeof hash === 'string' && hash.length > 0 ? hash : null;
}

async function generateSessionTokenHash(env: MoodleAuthEnv, email: string): Promise<string> {
  const response = await fetchWithTimeout(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const result = await readJson<GenerateLinkResponse>(response, 'SESSION_RESPONSE_INVALID');
  // GoTrue has returned both shapes across versions: current Supabase projects
  // expose hashed_token at the top level, while older releases nested it under
  // properties. Accept both so a platform upgrade cannot break login sessions.
  const hash = extractGeneratedTokenHash(result);
  if (!response.ok || !hash) throw new AcademicAuthError(503, 'SESSION_CREATION_FAILED', 'تم التحقق، لكن تعذر بدء جلسة الموقع.');
  return hash;
}

async function verifyAndSyncMoodleIdentity(
  env: MoodleAuthEnv,
  request: Request,
  forcedUserId?: string,
): Promise<{ email: string; sync: AcademicLoginResult['sync'] }> {
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    throw new AcademicAuthError(415, 'INVALID_CONTENT_TYPE', 'نوع الطلب غير مدعوم.');
  }
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 8_192) throw new AcademicAuthError(413, 'REQUEST_TOO_LARGE', 'الطلب أكبر من الحد المسموح.');

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 8_192) {
    throw new AcademicAuthError(413, 'REQUEST_TOO_LARGE', 'الطلب أكبر من الحد المسموح.');
  }
  let body: MoodleLoginBody;
  try {
    body = JSON.parse(rawBody) as MoodleLoginBody;
  } catch {
    throw new AcademicAuthError(400, 'INVALID_JSON', 'صيغة الطلب غير صحيحة.');
  }
  const studentId = normalizeStudentId(body.student_id);
  if (!studentId || typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 512) {
    throw new AcademicAuthError(400, 'INVALID_LOGIN_INPUT', 'أدخل الرقم الجامعي وكلمة المرور بشكل صحيح.');
  }

  await enforceLoginRateLimit(env, request, studentId);
  const { site, courses, verifiedEmail } = await authenticateMoodle(env, studentId, body.password);
  const providerUserId = String(site.userid);
  const email = verifiedEmail || syntheticEmail(providerUserId);
  let userId = forcedUserId || await rpc<string | null>(env, 'academic_resolve_user', {
      p_provider: PROVIDER,
      p_provider_user_id: providerUserId,
      p_student_id: studentId,
      p_email: verifiedEmail,
    });
  if (!userId) userId = await createSupabaseUser(env, email, site.fullname as string);

  const sync = await rpc<AcademicLoginResult['sync']>(env, 'academic_complete_sync', {
    p_user_id: userId,
    p_provider: PROVIDER,
    p_provider_user_id: providerUserId,
    p_student_id: studentId,
    p_full_name: site.fullname,
    p_avatar_url: site.userpictureurl || null,
    p_courses: courses,
    p_term_key: 'current',
  });
  return { email, sync };
}

export async function handleMoodleLogin(env: MoodleAuthEnv, request: Request): Promise<AcademicLoginResult> {
  const { email, sync } = await verifyAndSyncMoodleIdentity(env, request);
  const tokenHash = await generateSessionTokenHash(env, email);
  return { token_hash: tokenHash, verification_type: 'email', sync };
}

export async function handleMoodleLink(
  env: MoodleAuthEnv,
  request: Request,
  authenticatedUserId: string,
): Promise<AcademicLinkResult> {
  const { sync } = await verifyAndSyncMoodleIdentity(env, request, authenticatedUserId);
  return { sync };
}
