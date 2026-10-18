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
  timezone?: string;
  errorcode?: string;
}

interface MoodleCalendarEvent {
  id?: number;
  courseid?: number;
  timestart?: number;
  timeduration?: number;
  repeatid?: number;
  eventtype?: string;
  modulename?: string;
  location?: string;
}

interface MoodleCalendarResponse {
  events?: MoodleCalendarEvent[];
}

export interface MoodleMeetingPayload {
  course_external_id: string;
  external_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room: string | null;
  location: string | null;
}

interface MoodleDashboardLocation {
  course_external_id: string;
  location: string;
}

const ARABIC_WEEKDAY_CODES: Record<string, number> = {
  'ح': 0,
  'ن': 1,
  'ث': 2,
  'ر': 3,
  'خ': 4,
  'س': 6,
};

function normalizeCampusLocation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (/غ?زالي|عزالي/u.test(normalized)) return 'الغزالي';
  if (/هندس/u.test(normalized) || /حاسوب\s*(?:و|\/|-)?\s*هندس/u.test(normalized)) return 'هندسه وحاسوب';
  if (/حاسوب\s*ال(?:ا|أ)?عمال|ال(?:ا|أ)?عمال/u.test(normalized)) return 'الاعمال';
  return null;
}

/**
 * The university's Moodle dashboard includes a custom teacher_timetable block.
 * It is not exposed through Moodle's mobile web-service token, but it renders
 * a course-id and building together in the authenticated dashboard HTML.
 */
export function extractMoodleDashboardLocations(value: unknown): MoodleDashboardLocation[] {
  if (typeof value !== 'string') return [];
  const found = new Map<string, string>();
  const cards = value.matchAll(
    /<div\s+class="ttcard"[^>]*>[\s\S]{0,2400}?course\/view\.php\?id=(\d+)[^>]*>[\s\S]{0,2400}?ttmini--building[^>]*>[\s\S]*?<\/i>\s*([^<]+?)\s*<\/span>/gu,
  );
  for (const card of cards) {
    const courseId = card[1];
    const location = normalizeCampusLocation(card[2]);
    if (courseId && location) found.set(courseId, location);
  }
  return [...found.entries()].map(([course_external_id, location]) => ({ course_external_id, location }));
}

export function applyMoodleDashboardLocations(
  meetings: MoodleMeetingPayload[],
  dashboardLocations: MoodleDashboardLocation[],
): MoodleMeetingPayload[] {
  const locationsByCourse = new Map<string, Set<string>>();
  for (const item of dashboardLocations) {
    const locations = locationsByCourse.get(item.course_external_id) ?? new Set<string>();
    locations.add(item.location);
    locationsByCourse.set(item.course_external_id, locations);
  }
  return meetings.map((meeting) => {
    if (meeting.location) return meeting;
    const locations = locationsByCourse.get(meeting.course_external_id);
    // Do not guess when a course genuinely uses more than one building.
    if (!locations || locations.size !== 1) return meeting;
    return { ...meeting, location: [...locations][0]! };
  });
}

interface MoodleUser {
  id?: number;
  username?: string;
  email?: string;
  department?: string;
  profileimageurl?: string;
  customfields?: Array<{ type?: string; value?: unknown; name?: string; shortname?: string }>;
}

export interface AcademicProfileFields {
  academicYear: string | null;
  department: string | null;
  creditHours: number | null;
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

function fieldKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

export function extractAcademicProfile(user: MoodleUser | undefined): AcademicProfileFields {
  const fields = new Map<string, unknown>();
  for (const field of user?.customfields ?? []) {
    for (const key of [field.shortname, field.name]) {
      if (typeof key === 'string' && key.trim()) fields.set(fieldKey(key), field.value);
    }
  }
  const find = (aliases: string[]) => {
    for (const alias of aliases) {
      const value = fields.get(fieldKey(alias));
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return null;
  };
  const creditValue = find(['credit_hours', 'credithours', 'completedhours', 'passedhours', 'الساعات المقطوعة', 'ساعات مقطوعة']);
  const creditDigits = creditValue?.replace(/[^0-9.]/g, '') ?? '';
  const parsedCredits = creditDigits ? Number(creditDigits) : null;
  return {
    academicYear: find(['academic_year', 'academicyear', 'studyyear', 'level', 'السنة الدراسية', 'المستوى']),
    department: user?.department?.trim() || find(['department', 'major', 'specialization', 'programme', 'program', 'القسم', 'التخصص']),
    creditHours: parsedCredits !== null && Number.isFinite(parsedCredits) && parsedCredits >= 0 && parsedCredits <= 400
      ? Math.round(parsedCredits)
      : null,
  };
}

function safeUnixTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function localDateParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp * 1000));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdays[value('weekday')],
    time: `${value('hour')}:${value('minute')}`,
  };
}

export function normalizeMoodleMeetings(
  value: unknown,
  enrolledCourseIds: number[],
  timezone = 'Asia/Amman',
): MoodleMeetingPayload[] {
  const events = Array.isArray(value) ? value : [];
  const enrolled = new Set(enrolledCourseIds);
  let resolvedTimezone = timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: resolvedTimezone }).format(0);
  } catch {
    resolvedTimezone = 'Asia/Amman';
  }
  const candidates = events.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const event = raw as MoodleCalendarEvent;
    if (
      !Number.isSafeInteger(event.id)
      || !Number.isSafeInteger(event.courseid)
      || !enrolled.has(event.courseid as number)
      || !Number.isSafeInteger(event.timestart)
      || !Number.isSafeInteger(event.timeduration)
      || (event.timeduration as number) <= 0
      || (typeof event.modulename === 'string' && event.modulename.trim())
      || (event.eventtype && !['course', 'group'].includes(event.eventtype))
    ) return [];
    try {
      const start = localDateParts(event.timestart as number, resolvedTimezone);
      const end = localDateParts((event.timestart as number) + (event.timeduration as number), resolvedTimezone);
      if (start.weekday === undefined || end.weekday !== start.weekday || end.time <= start.time) return [];
      const place = normalizeCampusLocation(event.location);
      return [{
        event,
        key: `${event.courseid}|${start.weekday}|${start.time}|${end.time}|${place ?? ''}`,
        weekday: start.weekday,
        startsAt: start.time,
        endsAt: end.time,
        place,
      }];
    } catch {
      return [];
    }
  });

  const patternCounts = new Map<string, number>();
  for (const candidate of candidates) {
    patternCounts.set(candidate.key, (patternCounts.get(candidate.key) ?? 0) + 1);
  }
  const meetings = new Map<string, MoodleMeetingPayload>();
  for (const candidate of candidates) {
    const repeated = Number.isSafeInteger(candidate.event.repeatid) && (candidate.event.repeatid as number) > 0;
    if (!repeated && (patternCounts.get(candidate.key) ?? 0) < 2) continue;
    if (meetings.has(candidate.key)) continue;
    meetings.set(candidate.key, {
      course_external_id: String(candidate.event.courseid),
      external_id: repeated
        ? `moodle-calendar-repeat-${candidate.event.repeatid}`
        : `moodle-calendar-pattern-${candidate.event.id}`,
      weekday: candidate.weekday,
      starts_at: candidate.startsAt,
      ends_at: candidate.endsAt,
      room: null,
      location: candidate.place,
    });
  }
  return [...meetings.values()];
}

function normalizeCourseTime(value: string): string | null {
  const [hourPart, minutePart = '0'] = value.replace(':', '.').split('.');
  const hour = Number(hourPart);
  const minute = Number(minutePart.length === 1 ? `${minutePart}0` : minutePart);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function extractMeetingsFromCourseNames(courses: MoodleCourse[]): MoodleMeetingPayload[] {
  const meetings: MoodleMeetingPayload[] = [];
  const schedulePattern = /\/\s*([حنثرخس](?:\s+[حنثرخس])*)\s*\(\s*(\d{1,2}(?:[.:]\d{1,2})?)\s*-\s*(\d{1,2}(?:[.:]\d{1,2})?)\s*\)\s*$/u;
  for (const course of courses) {
    const match = course.fullname.match(schedulePattern);
    if (!match) continue;
    const startsAt = normalizeCourseTime(match[2] as string);
    const endsAt = normalizeCourseTime(match[3] as string);
    if (!startsAt || !endsAt || startsAt >= endsAt) continue;
    const weekdays = [...new Set((match[1] as string).split(/\s+/).map((code) => ARABIC_WEEKDAY_CODES[code]))]
      .filter((weekday): weekday is number => weekday !== undefined);
    for (const weekday of weekdays) {
      meetings.push({
        course_external_id: String(course.id),
        external_id: `moodle-course-name-${course.id}-${weekday}-${startsAt.replace(':', '')}`,
        weekday,
        starts_at: startsAt,
        ends_at: endsAt,
        room: null,
        location: normalizeCampusLocation(course.fullname),
      });
    }
  }
  return meetings;
}

function mergeMeetingPayloads(...sources: MoodleMeetingPayload[][]): MoodleMeetingPayload[] {
  const merged = new Map<string, MoodleMeetingPayload>();
  for (const source of sources) {
    for (const meeting of source) {
      const key = [meeting.course_external_id, meeting.weekday, meeting.starts_at, meeting.ends_at].join('|');
      const current = merged.get(key);
      merged.set(key, current && !meeting.room ? current : meeting);
    }
  }
  return [...merged.values()];
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

function sessionCookie(response: Response): string | null {
  // Moodle currently issues one session cookie here. Keep only its name/value;
  // security attributes are response-only and must never be replayed as cookies.
  const setCookie = response.headers.get('set-cookie');
  return setCookie?.split(';', 1)[0]?.trim() || null;
}

async function fetchMoodleDashboardLocations(
  baseUrl: string,
  studentId: string,
  password: string,
): Promise<MoodleDashboardLocation[]> {
  const loginPage = await fetchWithTimeout(`${baseUrl}/login/index.php?loginredirect=1`, {
    redirect: 'manual',
  });
  if (!loginPage.ok) return [];
  const loginHtml = await loginPage.text();
  const loginToken = loginHtml.match(/name=["']logintoken["']\s+value=["']([^"']+)["']/iu)?.[1];
  if (!loginToken) return [];

  const initialCookie = sessionCookie(loginPage);
  const loginResponse = await fetchWithTimeout(`${baseUrl}/login/index.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(initialCookie ? { Cookie: initialCookie } : {}),
    },
    body: new URLSearchParams({ username: studentId, password, logintoken: loginToken }),
  });
  const authenticatedCookie = sessionCookie(loginResponse);
  const cookies = [initialCookie, authenticatedCookie].filter((value): value is string => Boolean(value)).join('; ');
  if (!cookies) return [];

  const dashboardUrl = new URL(loginResponse.headers.get('location') || '/my/', baseUrl).toString();
  const dashboard = await fetchWithTimeout(dashboardUrl, {
    headers: { Cookie: cookies },
  });
  if (!dashboard.ok) return [];
  return extractMoodleDashboardLocations(await dashboard.text());
}

export async function readJsonResponse<T>(response: Response, code: string, allowEmpty = false): Promise<T> {
  const body = await response.text();
  if (!body.trim() && allowEmpty && response.ok) return null as T;
  try {
    return JSON.parse(body) as T;
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
  return await readJsonResponse<T>(response, 'ACADEMIC_DATABASE_RESPONSE_INVALID', true);
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
  const data = await readJsonResponse<T & { exception?: string; errorcode?: string }>(response, 'MOODLE_RESPONSE_INVALID');
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
  const tokenResult = await readJsonResponse<MoodleTokenResponse>(response, 'MOODLE_RESPONSE_INVALID');
  if (!tokenResult.token) {
    throw new AcademicAuthError(401, 'INVALID_CREDENTIALS', 'الرقم الجامعي أو كلمة المرور غير صحيحة.');
  }

  // The dashboard timetable is served by Moodle's regular HTML session rather
  // than its mobile API. It takes three dependent network requests, so start it
  // as soon as the credentials are verified instead of adding it to the end of
  // the critical login path. Failure remains non-fatal because the mobile API
  // still supplies the authoritative course list and most meeting data.
  const dashboardLocationsPromise = fetchMoodleDashboardLocations(baseUrl, studentId, password)
    .catch(() => [] as MoodleDashboardLocation[]);

  const site = await callMoodle<MoodleSiteInfo>(baseUrl, tokenResult.token, 'core_webservice_get_site_info');
  if (!site.userid || !site.fullname) {
    throw new AcademicAuthError(502, 'INVALID_MOODLE_PROFILE', 'لم ترجع منصة الجامعة ملفًا شخصيًا صالحًا.');
  }
  const availableFunctions = new Set((site.functions || []).map((item) => item.name));
  if (availableFunctions.size > 0 && !availableFunctions.has('core_enrol_get_users_courses')) {
    throw new AcademicAuthError(503, 'MOODLE_COURSES_UNAVAILABLE', 'خدمة مواد الطالب غير مفعّلة في منصة الجامعة.');
  }
  const coursesPromise = callMoodle<unknown>(
    baseUrl,
    tokenResult.token,
    'core_enrol_get_users_courses',
    { userid: String(site.userid) },
  )
    .then(normalizeMoodleCourses);
  const userPromise = site.username && availableFunctions.has('core_user_get_users_by_field')
    ? callMoodle<MoodleUser[]>(
        baseUrl,
        tokenResult.token,
        'core_user_get_users_by_field',
        { field: 'username', 'values[0]': site.username },
      )
    : Promise.resolve([] as MoodleUser[]);
  const [courses, users] = await Promise.all([coursesPromise, userPromise]);

  let meetings = extractMeetingsFromCourseNames(courses);
  let calendarMeetingsPromise = Promise.resolve([] as MoodleMeetingPayload[]);
  if (availableFunctions.has('core_calendar_get_calendar_events')) {
    const params: Record<string, string> = {
      'options[userevents]': '0',
      'options[siteevents]': '0',
      'options[timestart]': String(Math.floor(Date.now() / 1000) - 7 * 86_400),
      'options[timeend]': String(Math.floor(Date.now() / 1000) + 180 * 86_400),
    };
    courses.forEach((course, index) => {
      params[`events[courseids][${index}]`] = String(course.id);
    });
    calendarMeetingsPromise = callMoodle<MoodleCalendarResponse>(
      baseUrl,
      tokenResult.token,
      'core_calendar_get_calendar_events',
      params,
    )
      .then((calendar) => normalizeMoodleMeetings(
        calendar.events,
        courses.map((course) => course.id),
        site.timezone || 'Asia/Amman',
      ))
      // Calendar data is optional. Authentication and course sync must remain
      // available if the university disables or restricts this Moodle method.
      .catch(() => [] as MoodleMeetingPayload[]);
  }

  const [calendarMeetings, dashboardLocations] = await Promise.all([
    calendarMeetingsPromise,
    dashboardLocationsPromise,
  ]);
  meetings = applyMoodleDashboardLocations(
    mergeMeetingPayloads(meetings, calendarMeetings),
    dashboardLocations,
  );

  let verifiedEmail: string | null = null;
  const matchingUser = site.username
    ? users.find((user) => user.id === site.userid && user.username === site.username)
    : undefined;
  if (matchingUser?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(matchingUser.email)) {
    verifiedEmail = matchingUser.email.trim().toLowerCase();
  }

  return { site, courses, meetings, verifiedEmail, matchingUser };
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
  const user = await readJsonResponse<SupabaseUserResponse>(response, 'ACCOUNT_RESPONSE_INVALID');
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
  const result = await readJsonResponse<GenerateLinkResponse>(response, 'SESSION_RESPONSE_INVALID');
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
  const { site, courses, meetings, verifiedEmail, matchingUser } = await authenticateMoodle(env, studentId, body.password);
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
  const academicProfile = extractAcademicProfile(matchingUser);
  await Promise.all([
    rpc<null>(env, 'academic_update_profile', {
      p_user_id: userId,
      p_academic_year: academicProfile.academicYear,
      p_department: academicProfile.department,
      p_credit_hours: academicProfile.creditHours,
    }),
    rpc<number>(env, 'academic_replace_meetings', {
      p_user_id: userId,
      p_provider: PROVIDER,
      p_meetings: meetings,
    }),
  ]);
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
