import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/lib/types';
import { mapAuthError } from '@/lib/authErrors';
import { failService } from '@/lib/serviceError';

export interface AuthResult {
  error: string | null;
  notice?: string | null;
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: mapAuthError(error, 'حدث خطأ أثناء تسجيل الدخول') };
    return { error: null };
  } catch (err) {
    return { error: mapAuthError(err, 'حدث خطأ أثناء تسجيل الدخول') };
  }
}

export async function signUpWithEmail(email: string, password: string, fullName: string): Promise<AuthResult & { session?: unknown }> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: mapAuthError(error, 'حدث خطأ أثناء إنشاء الحساب') };
    if (data.user && data.session) return { error: null, session: data.session };
    if (data.user && !data.session) {
      return {
        error: null,
        notice: 'تم إنشاء الحساب بنجاح. يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول.',
      };
    }
    return { error: null };
  } catch (err) {
    return { error: mapAuthError(err, 'حدث خطأ أثناء إنشاء الحساب') };
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) return { error: mapAuthError(error, 'تعذر تسجيل الدخول عبر Google') };
  return { error: null };
}

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) failService('sign out', error);
}

export async function loadProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at, academic_year, department, credit_hours, bio')
    .eq('id', uid)
    .maybeSingle();
  if (error) failService('load profile', error);
  return data as Profile | null;
}

export async function updateProfile(
  id: string,
  updates: Partial<Pick<Profile, 'full_name' | 'academic_year' | 'department' | 'credit_hours' | 'bio'>>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', id);
  if (error) failService('update profile', error);
}

export async function updateUserRole(id: string, role: Role): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) failService('update user role', error);
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) failService('fetch profiles', error);
  return (data ?? []) as Profile[];
}
