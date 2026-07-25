import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { mapAuthError } from '@/lib/authErrors';
import type { Profile, Role } from '@/lib/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  role: Role | null;
  isAdmin: boolean;
  isTrusted: boolean;
  canPublishDirectly: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at, academic_year, department, credit_hours, bio')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.error('profile load error', error.message);
      setProfile(null);
      return;
    }
    setProfile(data as Profile | null);
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      const uid = data.session?.user?.id;
      if (uid) {
        loadProfile(uid).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      const uid = sess?.user?.id;
      if (uid) {
        loadProfile(uid);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function refreshProfile() {
    if (session?.user?.id) await loadProfile(session.user.id);
  }

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: mapAuthError(error, 'حدث خطأ أثناء تسجيل الدخول') };
      return { error: null };
    } catch (err) {
      return { error: mapAuthError(err, 'حدث خطأ أثناء تسجيل الدخول') };
    }
  }

  async function signUp(email: string, password: string, fullName: string) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) return { error: mapAuthError(error, 'حدث خطأ أثناء إنشاء الحساب') };
      if (data.user) {
        setSession(data.session);
        if (data.session?.user?.id) await loadProfile(data.session.user.id);
      }
      return { error: null };
    } catch (err) {
      return { error: mapAuthError(err, 'حدث خطأ أثناء إنشاء الحساب') };
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      console.error('google sign in error', error.message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  const role = profile?.role ?? null;
  const isAdmin = role === 'admin';
  const isTrusted = role === 'trusted' || role === 'admin';
  const canPublishDirectly = isTrusted;

  return (
    <AuthContext.Provider
      value={{
        session, profile, loading, role, isAdmin, isTrusted, canPublishDirectly,
        signIn, signUp, signInWithGoogle, signOut, refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
