import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Role } from '@/lib/types';

export interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  role: Role | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isTrusted: boolean;
  canPublishDirectly: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null; notice?: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; notice?: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);
