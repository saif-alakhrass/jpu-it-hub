import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authStub, issuedQuery, queueResponses, resetSupabaseStub, supabaseStub } from '@/test/supabaseStub';
import {
  fetchProfiles,
  loadProfile,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
  updateProfile,
  updateUserRole,
} from './auth';

vi.mock('@/lib/supabase', () => ({ supabase: supabaseStub, isSupabaseConfigured: true }));

beforeEach(() => {
  resetSupabaseStub();
});

describe('signInWithEmail', () => {
  it('reports success with no error', async () => {
    authStub.signInWithPassword.mockResolvedValue({ data: {}, error: null });

    await expect(signInWithEmail('a@b.com', 'secret')).resolves.toEqual({ error: null });
    expect(authStub.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret' });
  });

  it('maps a returned auth error to an Arabic message', async () => {
    authStub.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });

    await expect(signInWithEmail('a@b.com', 'wrong')).resolves.toEqual({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
  });

  it('maps a thrown network failure', async () => {
    authStub.signInWithPassword.mockRejectedValue(new Error('Failed to fetch'));

    const result = await signInWithEmail('a@b.com', 'secret');
    expect(result.error).toContain('تحقق من اتصالك');
  });
});

describe('signUpWithEmail', () => {
  it('returns the session when sign-up logs the user straight in', async () => {
    authStub.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null });

    await expect(signUpWithEmail('a@b.com', 'secret', 'سيف')).resolves.toEqual({ error: null, session: { access_token: 't' } });
    expect(authStub.signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret',
      options: { data: { full_name: 'سيف' } },
    });
  });

  it('asks the user to confirm their email when no session is issued', async () => {
    authStub.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });

    const result = await signUpWithEmail('a@b.com', 'secret', 'سيف');
    expect(result.error).toBeNull();
    expect(result.notice).toContain('تأكيد بريدك');
  });

  it('returns a bare success when Supabase returns neither user nor session', async () => {
    authStub.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });

    await expect(signUpWithEmail('a@b.com', 'secret', 'سيف')).resolves.toEqual({ error: null });
  });

  it('maps returned and thrown errors', async () => {
    authStub.signUp.mockResolvedValue({ data: {}, error: { message: 'User already registered' } });
    expect((await signUpWithEmail('a@b.com', 'secret', 'سيف')).error).toContain('مسجل بالفعل');

    authStub.signUp.mockRejectedValue(new Error('boom'));
    expect((await signUpWithEmail('a@b.com', 'secret', 'سيف')).error).toBe('boom');
  });
});

describe('OAuth and sign-out', () => {
  it('starts the Google flow with the current origin as redirect', async () => {
    authStub.signInWithOAuth.mockResolvedValue({ data: {}, error: null });

    await signInWithGoogle();

    expect(authStub.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  });

  it('signs the user out', async () => {
    authStub.signOut.mockResolvedValue({ error: null });

    await signOutUser();

    expect(authStub.signOut).toHaveBeenCalled();
  });
});

describe('profiles', () => {
  it('loads a profile by id', async () => {
    queueResponses({ data: { id: 'u1', role: 'student' }, error: null });

    await expect(loadProfile('u1')).resolves.toEqual({ id: 'u1', role: 'student' });
    expect(issuedQuery(0).argsFor('eq')).toEqual(['id', 'u1']);
  });

  it('returns null when the profile cannot be read', async () => {
    queueResponses({ data: null, error: { message: 'denied' } });

    await expect(loadProfile('u1')).resolves.toBeNull();
  });

  it('updates editable profile fields', async () => {
    queueResponses({ data: null, error: null }, { data: null, error: { message: 'denied' } });

    await expect(updateProfile('u1', { full_name: 'سيف', bio: 'طالب' })).resolves.toBe(true);
    await expect(updateProfile('u1', { bio: 'طالب' })).resolves.toBe(false);
    expect(issuedQuery(0).argsFor('update')).toEqual([{ full_name: 'سيف', bio: 'طالب' }]);
  });

  it('promotes a user to another role', async () => {
    queueResponses({ data: null, error: null });

    await expect(updateUserRole('u1', 'trusted')).resolves.toBe(true);
    expect(issuedQuery(0).argsFor('update')).toEqual([{ role: 'trusted' }]);
  });

  it('lists the newest profiles and falls back to an empty list on error', async () => {
    queueResponses({ data: [{ id: 'u1' }], error: null }, { data: null, error: { message: 'denied' } });

    await expect(fetchProfiles()).resolves.toEqual([{ id: 'u1' }]);
    expect(issuedQuery(0).argsFor('limit')).toEqual([100]);
    await expect(fetchProfiles()).resolves.toEqual([]);
  });
});
