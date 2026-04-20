import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  hasAcceptedCharter: boolean;
  rulesAccepted: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  isAdmin: false,
  hasAcceptedCharter: false,
  rulesAccepted: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasAcceptedCharter, setHasAcceptedCharter] = useState(false);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    setProfile(data);
    setHasAcceptedCharter(data?.has_accepted_charter ?? false);

    // Activate profile on first confirmed login if not yet activated
    if (data && !(data as any).is_activated) {
      await supabase
        .from('profiles')
        .update({ is_activated: true } as any)
        .eq('user_id', userId);
      // Re-fetch to get updated state
      const { data: updated } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      setProfile(updated);
    }
  };

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    setIsAdmin(!!data);
  };

  const refreshProfile = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      await fetchProfile(currentUser.id);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadUserData = async (session: Session | null) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        try {
          await Promise.all([
            fetchProfile(session.user.id),
            fetchRole(session.user.id),
          ]);
        } catch (e) {
          console.error('Error loading user data:', e);
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
        setHasAcceptedCharter(false);
      }
      if (mounted) setLoading(false);
    };

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      loadUserData(session);
    });

    // Listen for auth changes (skip initial since we handle it above)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (_event === 'INITIAL_SESSION') return;
        loadUserData(session);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, isAdmin, hasAcceptedCharter, rulesAccepted: (profile as any)?.rules_accepted ?? false, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
