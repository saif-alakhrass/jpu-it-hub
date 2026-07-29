import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { signInWithEmail, signUpWithEmail, signInWithGoogle as signInWithGoogleSvc, signOutUser, loadProfile as loadProfileSvc } from '@/services/auth';
import type { Profile, Role } from '@/lib/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  role: Role | null;
  isAdmin: boolean;
  isTrusted: boolean;
  canPublishDirectly: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null; notice?: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; notice?: string | null }>;
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
    const p = await loadProfileSvc(uid);
    setProfile(p);
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
      (async () => {
        setSession(sess);
        const uid = sess?.user?.id;
        if (uid) {
          await loadProfile(uid);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
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
    if (!isSupabaseConfigured) return { error: 'مفاتيح الاتصال بقاعدة البيانات غير متوفرة', notice: null };
    return signInWithEmail(email, password);
  }

  async function signUp(email: string, password: string, fullName: string) {
    if (!isSupabaseConfigured) return { error: 'مفاتيح الاتصال بقاعدة البيانات غير متوفرة', notice: null };
    const res = await signUpWithEmail(email, password, fullName);
    if (res.error) return { error: res.error, notice: null };
    if (res.session) {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      const uid = data.session?.user?.id;
      if (uid) await loadProfile(uid);
      return { error: null, notice: null };
    }
    if (res.notice) return { error: null, notice: res.notice };
    return { error: null, notice: null };
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured) return;
    await signInWithGoogleSvc();
  }

  async function signOut() {
    await signOutUser();
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
