import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNavConfig } from '@/contexts/NavConfigContext';
import { supabase } from '@/integrations/supabase/client';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { Target, Newspaper, Trophy, Heart, User, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavTab {
  to: string;
  label: string;
  shortLabel: string;
  emoji: string;
  icon: React.ElementType;
  configKey?: string; // if set, can be hidden by admin
}

const ALL_TABS: NavTab[] = [
  { to: '/', label: 'Paris', shortLabel: 'Paris', emoji: '🎯', icon: Target },
  { to: '/gazette', label: 'Gazette', shortLabel: 'Gazette', emoji: '📰', icon: Newspaper },
  { to: '/classement', label: 'Classement', shortLabel: 'Class.', emoji: '🏆', icon: Trophy, configKey: 'classement' },
  { to: '/kiss-marry', label: 'Kiss/Marry', shortLabel: 'K/M', emoji: '💋', icon: Heart, configKey: 'kiss-marry' },
  { to: '/profil', label: 'Profil', shortLabel: 'Profil', emoji: '👤', icon: User },
];

export default function Navbar() {
  const { profile, signOut, user } = useAuth();
  const { visibleTabs } = useNavConfig();
  const location = useLocation();
  const [rank, setRank] = useState<number | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [liveBalance, setLiveBalance] = useState(profile?.balance ?? 0);

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

  // Filter tabs based on admin config
  const visibleNavTabs = ALL_TABS.filter((tab) => {
    if (!tab.configKey) return true; // non-maskable tabs always show
    return visibleTabs[tab.configKey] !== false;
  });

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
            {visibleNavTabs.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === tab.to
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <span>{tab.emoji}</span>
                {tab.label}
              </Link>
            ))}
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
              <span className="text-sm">🪙</span>
              <span className="font-semibold text-primary text-sm">{liveBalance} DC</span>
            </div>
            {rankText && (
              <span className="text-xs text-muted-foreground lg:hidden bg-secondary px-2 py-0.5 rounded-full">
                {rankText}
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={signOut} title="Déconnexion" className="hidden sm:flex">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ─── BOTTOM NAV (mobile only) ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
        <div className="flex justify-around py-1.5">
          {visibleNavTabs.map((tab) => {
            const isActive = location.pathname === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex flex-col items-center gap-0.5 px-1 py-1 min-w-0 ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <span className="text-lg">{tab.emoji}</span>
                <span className="text-[10px] leading-tight truncate max-w-[48px]">
                  {tab.shortLabel}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
