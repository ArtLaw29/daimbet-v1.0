import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { Trophy, Flame, Heart, MessageSquarePlus, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navItems = [
  { to: '/', label: 'Paris', icon: Flame },
  { to: '/leaderboard', label: 'Classement', icon: Trophy },
  { to: '/kiss-marry', label: 'Kiss/Marry', icon: Heart },
  { to: '/proposals', label: 'Proposer', icon: MessageSquarePlus },
];

export default function Navbar() {
  const { profile, signOut } = useAuth();
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-50 glass border-b border-border">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={daimcoinLogo} alt="DAIMBet" className="w-8 h-8 rounded-full" />
          <span className="font-display text-2xl gold-text">DAIMBet</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === item.to
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {profile && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border">
              <img src={daimcoinLogo} alt="coins" className="w-5 h-5 rounded-full" />
              <span className="font-semibold text-primary text-sm">{profile.balance} DC</span>
            </div>
          )}
          <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.display_name}</span>
          <Button variant="ghost" size="icon" onClick={signOut} title="Déconnexion">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden flex justify-around border-t border-border py-1">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-xs ${
              location.pathname === item.to ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
