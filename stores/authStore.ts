import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { setSentryUser } from '@/lib/sentry';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /**
   * True once the profile row has a DEFINITIVE answer — either it loaded, or the
   * query succeeded and confirmed no row exists (a genuinely new account).
   * Stays false when the query itself failed, so `profile === null` alone can no
   * longer be mistaken for "new user": that mistake sent existing users through
   * onboarding whenever a fetch hiccuped. See the router guard in _layout.
   */
  profileLoaded: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  /** Resolves true when the profile is settled, false when the query failed. */
  fetchProfile: (userId: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  profileLoaded: false,
  setUser: (user) => { setSentryUser(user?.id ?? null); set({ user }); },
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile, profileLoaded: true }),
  setLoading: (loading) => set({ loading }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, profile: null, profileLoaded: false });
  },
  fetchProfile: async (userId: string) => {
    // maybeSingle, not single: `single()` treats "no rows" as an ERROR, which is
    // indistinguishable from a network failure at the call site. maybeSingle
    // returns data:null with no error for a genuinely absent row, so the two
    // cases can finally be told apart.
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (__DEV__) console.warn('[authStore] fetchProfile error:', error.message);
      // Deliberately do NOT null the profile here. Overwriting a good profile
      // with null on a transient failure is what made a signed-in user look
      // brand new — empty name, default coach, and a bounce into onboarding.
      set({ profileLoaded: false });
      return false;
    }

    set({ profile: data ?? null, profileLoaded: true });
    return true;
  },
}));
