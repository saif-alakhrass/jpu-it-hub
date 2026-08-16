import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { signInWithEmail, signUpWithEmail, signInWithGoogle as signInWithGoogleSvc, signOutUser, loadProfile as loadProfileSvc } from '@/services/auth';
import type { Profile } from '@/lib/types';
import { AuthContext } from '@/context/authState';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string) {
    const p = await loadProfileSvc(uid);
    setProfile(p);
  }

  /**
   * The session is already known at this point, so a failing profile query must
   * not keep the app in its loading state or surface as an unhandled rejection.
   */
  const loadProfileForSession = useCallback(async (uid: string) => {
    try {
      setProfile(await loadProfileSvc(uid));
    } catch (err) {
      console.error('Failed to load profile for the current session', err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        const uid = data.session?.user?.id;
        if (uid) await loadProfileForSession(uid);
      })
      .catch((err: unknown) => {
        console.error('Failed to restore the authentication session', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      void (async () => {
        setSession(sess);
        const uid = sess?.user?.id;
        if (uid) {
          await loadProfileForSession(uid);
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
  }, [loadProfileForSession]);

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
      if (uid) await loadProfileForSession(uid);
      return { error: null, notice: null };
    }
    if (res.notice) return { error: null, notice: res.notice };
    return { error: null, notice: null };
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured) return { error: 'مفاتيح الاتصال بقاعدة البيانات غير متوفرة' };
    return signInWithGoogleSvc();
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
