import { useEffect, useState } from 'react';
import { useGameStatus, useAllGameStatus } from '@/hooks/useGameStatus';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldAlert, EyeOff } from 'lucide-react';

export interface SubTab {
  key: string;          // game_status.game_key
  label: string;
  emoji: string;
  render: () => JSX.Element;
}

interface Props {
  title: string;
  titleEmoji: string;
  subtitle?: string;
  tabs: SubTab[];
  initialTabKey?: string;
}

export default function SectionTabs({ title, titleEmoji, subtitle, tabs, initialTabKey }: Props) {
  const { isAdmin } = useAuth();
  const { statuses, loading } = useAllGameStatus();
  const [activeKey, setActiveKey] = useState<string>(initialTabKey || tabs[0]?.key);

  // Filter out hidden tabs (admins still see them, with a marker)
  const visibleTabs = tabs.filter(t => {
    const s = statuses[t.key];
    if (s?.hidden && !isAdmin) return false;
    return true;
  });

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(t => t.key === activeKey)) {
      setActiveKey(visibleTabs[0].key);
    }
  }, [visibleTabs.map(t => t.key).join(','), activeKey]);

  const active = visibleTabs.find(t => t.key === activeKey);
  const activeStatus = active ? statuses[active.key] : undefined;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Chargement…
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-24 md:pb-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-display gold-text">{titleEmoji} {title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>

      {visibleTabs.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <p className="text-5xl">🚫</p>
          <h2 className="text-xl font-display">Aucune section disponible</h2>
          <p className="text-muted-foreground text-sm">Reviens plus tard !</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:justify-center">
            {visibleTabs.map(tab => {
              const s = statuses[tab.key];
              const isActive = activeKey === tab.key;
              const isSusp = !!s?.suspended;
              const isHid = !!s?.hidden;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveKey(tab.key)}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-sm font-medium ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary shadow-md'
                      : 'border-border bg-card hover:border-primary/30 hover:bg-secondary/50'
                  }`}
                  title={isHid && isAdmin ? 'Caché aux utilisateurs (admin only)' : undefined}
                >
                  <span className="text-lg">{tab.emoji}</span>
                  <span>{tab.label}</span>
                  {isSusp && <ShieldAlert className="w-3.5 h-3.5 text-destructive" />}
                  {isHid && isAdmin && <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              );
            })}
          </div>

          <div>
            {active && activeStatus?.suspended && !isAdmin ? (
              <SuspendedScreen label={active.label} />
            ) : active ? (
              active.render()
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function SuspendedScreen({ label }: { label: string }) {
  return (
    <div className="text-center py-20 space-y-3">
      <p className="text-6xl">⏸️</p>
      <h2 className="text-xl font-display text-destructive">{label}</h2>
      <p className="text-muted-foreground text-sm max-w-md mx-auto">
        Jeu temporairement suspendu par l'administration.
      </p>
    </div>
  );
}

/** Single-game wrapper used by routes that load a specific real page (Wordle, Sudoku, etc.). */
export function SingleGameWrapper({ gameKey, label, children }: { gameKey: string; label: string; children: React.ReactNode }) {
  const { suspended, hidden, loading } = useGameStatus(gameKey);
  const { isAdmin } = useAuth();
  if (loading) return null;
  if (hidden && !isAdmin) return <SuspendedScreen label={label} />;
  if (suspended && !isAdmin) return <SuspendedScreen label={label} />;
  return <>{children}</>;
}