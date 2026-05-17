import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ResumeGameBanner from '@/components/ResumeGameBanner';
import { useUnreadGazette } from '@/hooks/useUnreadGazette';
import { useNavConfig } from '@/contexts/NavConfigContext';

interface NavTab {
  to: string;
  label: string;
  shortLabel: string;
  emoji: string;
}

const ALL_TABS: NavTab[] = [
  { to: '/paris',     label: 'Paris',         shortLabel: 'Paris',  emoji: '💸' },
  { to: '/promo',     label: 'Jeux de promo', shortLabel: 'Promo',  emoji: '🏛️' },
  { to: '/jeux',      label: 'Jeux',          shortLabel: 'Jeux',   emoji: '🎮' },
  { to: '/mini-jeux', label: 'Mini-jeux',     shortLabel: 'Mini',   emoji: '🧩' },
  { to: '/casino',    label: 'Casino',        shortLabel: 'Casino', emoji: '🎰' },
  { to: '/la-promo',  label: 'La promo',      shortLabel: 'Promo',  emoji: '📰' },
  { to: '/profil',    label: 'Profil',        shortLabel: 'Profil', emoji: '👤' },
];

export default function Navbar() {
  const { profile, signOut, user } = useAuth();
  const location = useLocation();
  const [rank, setRank] = useState<number | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [liveBalance, setLiveBalance] = useState(profile?.balance ?? 0);
  const [hasUnreadTicket, setHasUnreadTicket] = useState(false);
  const { hasUnreadGazette } = useUnreadGazette();

  // Calculate rank
  useEffect(() => {
    if (!user) return;
    const fetchRank = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, balance')
        .order('balance', { ascending: false });
      if (data) {
        setTotalUsers(data.length);
        const idx = data.findIndex((p) => p.user_id === user.id);
        if (idx >= 0) {
          // Handle ties: rank = count of users with higher balance + 1
          const myBalance = data[idx].balance;
          const higherCount = data.filter((p) => p.balance > myBalance).length;
          setRank(higherCount + 1);
        }
      }
    };
    fetchRank();
  }, [user, liveBalance]);

  // Realtime balance updates
  useEffect(() => {
    if (!user) return;
    setLiveBalance(profile?.balance ?? 0);

    const channel = supabase
      .channel('profile-balance')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && typeof (payload.new as any).balance === 'number') {
            setLiveBalance((payload.new as any).balance);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile]);

  // Track unread admin replies → red badge on Profil tab
  useEffect(() => {
    if (!user) { setHasUnreadTicket(false); return; }

    const computeUnread = async () => {
      const { data } = await supabase
        .from('tickets')
        .select('admin_replied_at, user_last_seen_at')
        .eq('user_id', user.id);
      const unread = (data || []).some((t: any) => {
        if (!t.admin_replied_at) return false;
        if (!t.user_last_seen_at) return true;
        return new Date(t.admin_replied_at) > new Date(t.user_last_seen_at);
      });
      setHasUnreadTicket(unread);
    };

    computeUnread();

    const channel = supabase
      .channel(`tickets-badge-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `user_id=eq.${user.id}` }, () => computeUnread())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages' }, () => computeUnread())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, location.pathname]);

  const { visibleTabs: navConfig, loading: navLoading } = useNavConfig();
  const visibleNavTabs = navLoading
    ? ALL_TABS
    : ALL_TABS.filter(t => navConfig[t.to] !== false);

  const rankText = rank && totalUsers > 0 ? `${rank}${rank === 1 ? 'er' : 'ème'} / ${totalUsers}` : '';

  return (
    <>
      {/* ─── HEADER (top bar) ─── */}
      <header className="sticky top-0 z-50 glass border-b border-border" role="banner">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2" aria-label="Accueil DaimBet">
            <img src={daimcoinLogo} alt="Logo DaimBet" className="w-7 h-7 rounded-full" />
            <span className="font-display text-xl text-primary tracking-wider hidden sm:inline">DAIMBET</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Navigation principale">
            {visibleNavTabs.map((tab) => {
              const showDot = tab.to === '/profil' && hasUnreadTicket;
              const showGazetteDot = tab.to === '/la-promo' && hasUnreadGazette;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname.startsWith(tab.to)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <span>{tab.emoji}</span>
                  {tab.label}
                  {showDot && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-destructive rounded-full ring-2 ring-background" aria-label="Nouveau message admin" />
                  )}
                  {showGazetteDot && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full ring-2 ring-background" aria-label="Nouveau message dans la Gazette" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User info */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {profile?.display_name}
            </span>
            {rankText && (
              <span className="text-xs text-muted-foreground hidden lg:inline bg-secondary px-2 py-0.5 rounded-full">
                {rankText}
              </span>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary border border-border">
              <img src={daimcoinLogo} alt="DC" className="w-4 h-4 rounded-full" loading="lazy" width={16} height={16} />
              <span className="font-semibold text-primary text-sm">{liveBalance} DC</span>
            </div>
            {rankText && (
              <span className="text-xs text-muted-foreground lg:hidden bg-secondary px-2 py-0.5 rounded-full">
                {rankText}
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Déconnexion" className="hidden sm:flex">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <ResumeGameBanner />

      {/* ─── BOTTOM NAV (mobile only) ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-border" role="navigation" aria-label="Navigation mobile">
        <div className="flex justify-around py-1.5">
          {visibleNavTabs.map((tab) => {
            const isActive = location.pathname.startsWith(tab.to);
            const showDot = tab.to === '/profil' && hasUnreadTicket;
            const showGazetteDot = tab.to === '/la-promo' && hasUnreadGazette;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-label={tab.label}
                className={`relative flex flex-col items-center gap-0.5 px-1 py-1 min-w-0 ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <span className="text-lg">{tab.emoji}</span>
                <span className="text-[10px] leading-tight truncate max-w-[48px]">
                  {tab.shortLabel}
                </span>
                {showDot && (
                  <span className="absolute top-0.5 right-2 w-2.5 h-2.5 bg-destructive rounded-full ring-2 ring-background" aria-label="Nouveau message admin" />
                )}
                {showGazetteDot && (
                  <span className="absolute top-0.5 right-2 w-2 h-2 bg-destructive rounded-full ring-2 ring-background" aria-label="Nouveau message dans la Gazette" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
