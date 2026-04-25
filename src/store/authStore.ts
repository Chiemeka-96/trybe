import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthState {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  signUp: (email: string, password: string, username: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

/**
 * Ensure a profile row exists for the given auth user.
 * Optimized: single upsert instead of select-then-insert to reduce DB round trips at scale.
 */
async function ensureProfile(userId: string, email: string): Promise<Profile | null> {
  const fallbackUsername = 'user_' + userId.slice(0, 8);

  // Single upsert — handles both existing and missing profiles atomically
  const { data: profile } = await supabase
    .from('profiles')
    .upsert({ id: userId, username: fallbackUsername }, { onConflict: 'id', ignoreDuplicates: true })
    .select()
    .single();

  // If upsert returned data, use it; otherwise try a direct fetch
  // (the upsert with ignoreDuplicates may not return the existing row on some Supabase versions)
  if (profile) return profile;

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  return existing;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const profile = await ensureProfile(session.user.id, session.user.email!);
      set({
        user: { id: session.user.id, email: session.user.email! },
        profile,
        initialized: true,
      });
    } else {
      set({ initialized: true });
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await ensureProfile(session.user.id, session.user.email!);
        set({
          user: { id: session.user.id, email: session.user.email! },
          profile,
        });
      } else {
        set({ user: null, profile: null });
      }
    });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    set({ profile });
  },

  signUp: async (email, password, username) => {
    set({ loading: true });
    // Check username availability
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();
    if (existing) {
      set({ loading: false });
      return { error: 'Username already taken' };
    }

    // Pass username in user metadata so the DB trigger can use it
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) {
      set({ loading: false });
      return { error: error.message };
    }
    if (data.user) {
      // Try to create the profile from the client too (belt + suspenders with the trigger)
      const { error: profileError } = await supabase.from('profiles').upsert(
        { id: data.user.id, username },
        { onConflict: 'id' }
      );
      if (profileError) {
        // Check if it's a unique constraint violation on username (concurrent signup race)
        if (profileError.message?.includes('unique') || profileError.code === '23505') {
          set({ loading: false });
          return { error: 'Username was taken by another user. Please try a different one.' };
        }
      }
    }
    set({ loading: false });
    return {};
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    if (error) return { error: error.message };
    return {};
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },
}));
