import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { signInWithEmail, signUpWithEmail, signInWithGoogle as signInWithGoogleSvc, signOutUser, loadProfile as loadProfileSvc } from '@/services/auth';
import type { Profile } from '@/lib/types';
import { AuthContext } from '@/context/authState';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileLoadRef = useRef<{ uid: string; promise: Promise<Profile | null> } | null>(null);

  async function loadProfile(uid: string) {
    let pending = profileLoadRef.current;
    if (!pending || pending.uid !== uid) {
      pending = { uid, promise: loadProfileSvc(uid) };
      profileLoadRef.current = pending;
    }
    const p = await pending.promise;
    if (profileLoadRef.current === pending) profileLoadRef.current = null;
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
  const isSuperAdmin = Boolean(profile?.is_super_admin);
  // A super-admin must never lose access because of a temporarily inconsistent
  // role value while a migration/profile refresh is in flight.
  const isAdmin = role === 'admin' || isSuperAdmin;
  const isTrusted = role === 'trusted' || isAdmin;
  const canPublishDirectly = isTrusted;

  return (
    <AuthContext.Provider
      value={{
        session, profile, loading, role, isAdmin, isSuperAdmin, isTrusted, canPublishDirectly,
        signIn, signUp, signInWithGoogle, signOut, refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
