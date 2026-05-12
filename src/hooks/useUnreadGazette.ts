import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useUnreadGazette() {
  const { user } = useAuth();
  const [hasUnreadGazette, setHasUnreadGazette] = useState(false);

  const compute = async (uid: string) => {
    const [{ data: profile }, { data: latest }] = await Promise.all([
      supabase.from('profiles').select('last_read_gazette').eq('user_id', uid).maybeSingle(),
      supabase
        .from('gazette_messages')
        .select('created_at')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!latest?.created_at) {
      setHasUnreadGazette(false);
      return;
    }
    const lastRead = (profile as any)?.last_read_gazette;
    if (!lastRead) {
      setHasUnreadGazette(true);
      return;
    }
    setHasUnreadGazette(new Date(latest.created_at) > new Date(lastRead));
  };

  const markAsRead = async () => {
    if (!user) return;
    setHasUnreadGazette(false);
    await supabase
      .from('profiles')
      .update({ last_read_gazette: new Date().toISOString() } as any)
      .eq('user_id', user.id);
  };

  useEffect(() => {
    if (!user) {
      setHasUnreadGazette(false);
      return;
    }
    compute(user.id);

    const channel = supabase
      .channel(`gazette-unread-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gazette_messages' },
        () => compute(user.id),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
        () => compute(user.id),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { hasUnreadGazette, markAsRead };
}