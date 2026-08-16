import { describe, expect, it } from 'vitest';
import {
  ROLES,
  ROLE_LABELS,
  UPLOAD_MAX_PER_WINDOW,
  UPLOAD_MAX_PER_WINDOW_BY_ROLE,
  getUploadLimit,
} from './constants';

describe('upload limits', () => {
  it('gives every role its own quota', () => {
    expect(getUploadLimit('student')).toBe(UPLOAD_MAX_PER_WINDOW_BY_ROLE.student);
    expect(getUploadLimit('trusted')).toBe(UPLOAD_MAX_PER_WINDOW_BY_ROLE.trusted);
    expect(getUploadLimit('admin')).toBe(UPLOAD_MAX_PER_WINDOW_BY_ROLE.admin);
  });

  it('falls back to the student quota before a role is known', () => {
    expect(getUploadLimit(null)).toBe(UPLOAD_MAX_PER_WINDOW);
    expect(getUploadLimit(undefined)).toBe(UPLOAD_MAX_PER_WINDOW);
    expect(UPLOAD_MAX_PER_WINDOW).toBe(UPLOAD_MAX_PER_WINDOW_BY_ROLE.student);
  });

  it('keeps the quota ordering and role labels aligned', () => {
    expect(UPLOAD_MAX_PER_WINDOW_BY_ROLE.student).toBeLessThan(UPLOAD_MAX_PER_WINDOW_BY_ROLE.trusted);
    expect(UPLOAD_MAX_PER_WINDOW_BY_ROLE.trusted).toBeLessThan(UPLOAD_MAX_PER_WINDOW_BY_ROLE.admin);
    expect(ROLES.every((role) => typeof ROLE_LABELS[role] === 'string')).toBe(true);
  });
});
