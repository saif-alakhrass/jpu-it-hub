export const GETTING_STARTED_VIDEO_URL = 'https://youtu.be/xrOujveUoBw';
export const ACCOUNT_NEW_FOR_DAYS = 30;
export const MAX_PROMPT_SESSIONS = 3;

export function isNewAccount(createdAt: string | undefined, now = Date.now()) {
  if (!createdAt) return false;
  const createdTime = Date.parse(createdAt);
  if (!Number.isFinite(createdTime)) return false;
  const age = now - createdTime;
  return age >= 0 && age <= ACCOUNT_NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
}
