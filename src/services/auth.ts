import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/lib/types';
import { mapAuthError } from '@/lib/authErrors';

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

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

export async function signOutUser(): Promise<void> {
  await supabase.auth.signOut();
}

export async function loadProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_super_admin, created_at, academic_year, department, credit_hours, bio')
    .eq('id', uid)
    .maybeSingle();
  if (error) return null;
  return data as Profile | null;
}

export async function updateProfile(
  id: string,
  updates: Partial<Pick<Profile, 'full_name' | 'academic_year' | 'department' | 'credit_hours' | 'bio'>>,
): Promise<boolean> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', id);
  return !error;
}

export async function updateUserRole(id: string, role: Role): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  return !error;
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_super_admin, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return [];
  return (data ?? []) as Profile[];
}

export async function banUser(
  userId: string,
  banType: 'temporary' | 'permanent',
  banDays: number,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('ban_user', {
    target_user_id: userId,
    p_ban_type: banType,
    p_ban_days: banDays,
    p_reason: reason,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function unbanUser(email: string): Promise<boolean> {
  const { error } = await supabase.rpc('unban_user_by_email', { target_email: email });
  return !error;
}

export async function fetchBannedUsers(): Promise<import('@/lib/types').BannedIdentity[]> {
  const { data, error } = await supabase
    .from('banned_identities')
    .select('*')
    .order('banned_at', { ascending: false });
  if (error) return [];
  return data as import('@/lib/types').BannedIdentity[];
}
