import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { Lock, ShieldAlert } from 'lucide-react';
import { useAllGameStatus } from '@/hooks/useGameStatus';
import { useAuth } from '@/contexts/AuthContext';
import KissMarryPage from './KissMarryPage';
import GameSessionsList from '@/components/GameSessionsList';
import SondagePage from '@/components/SondagePage';
import TournoiPage from '@/components/TournoiPage';
import GouvernementPage from '@/components/GouvernementPage';
import FantasyFirmPage from '@/components/FantasyFirmPage';

interface GameTab {
  id: string;
  emoji: string;
  label: string;
  subtitleKey: string;
  defaultSubtitle: string;
  available: boolean;
}

const GAME_TABS: GameTab[] = [
  { id: 'daimocratie', emoji: '🗳️', label: 'Daimocratie', subtitleKey: 'game_subtitle_daimocratie', defaultSubtitle: 'Sondages', available: true },
  { id: 'you-decide', emoji: '⚔️', label: 'Tournois', subtitleKey: 'game_subtitle_you_decide', defaultSubtitle: 'Tournois', available: true },
  { id: 'gouvernement', emoji: '🏛️', label: 'Gouvernement', subtitleKey: 'game_subtitle_gouvernement', defaultSubtitle: '', available: true },
  { id: 'fantasy-firm', emoji: '⚖️', label: 'Fantasy Firm', subtitleKey: 'game_subtitle_fantasy_firm', defaultSubtitle: '', available: true },
  { id: 'kiss-marry', emoji: '💋', label: 'Kiss/Marry', subtitleKey: 'game_subtitle_kiss_marry', defaultSubtitle: 'Vote mensuel anonyme', available: true },
];

const TAB_TO_GAME_KEY: Record<string, string> = {
  'daimocratie': 'daimocratie',
  'you-decide': 'tournois',
  'gouvernement': 'gouvernement',
  'fantasy-firm': 'fantasy_firm',
  'kiss-marry': 'kiss_marry',
};

export default function GamesPage() {
  const [activeTab, setActiveTab] = useState('daimocratie');
  const [subtitles, setSubtitles] = useState<Record<string, string>>({});
  const { statuses } = useAllGameStatus();
  const { isAdmin } = useAuth();

  useEffect(() => {
    const fetchSubtitles = async () => {
      const subtitleKeys = GAME_TABS.map(t => t.subtitleKey);
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', subtitleKeys);
      if (data) {
        const subs: Record<string, string> = {};
        data.forEach(r => { subs[r.key] = r.value; });
        setSubtitles(subs);
      }
    };
    fetchSubtitles();
  }, []);

  const isHidden = (tabId: string) => !!statuses[TAB_TO_GAME_KEY[tabId]]?.hidden;
  const isSuspended = (tabId: string) => !!statuses[TAB_TO_GAME_KEY[tabId]]?.suspended;

  const visibleTabs = GAME_TABS.filter(t => isAdmin || !isHidden(t.id));

  // If active tab becomes hidden, switch to first visible
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const getSubtitle = (tab: GameTab) => subtitles[tab.subtitleKey] || tab.defaultSubtitle;

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-display gold-text">🎮 Jeux Promo</h1>
        <p className="text-sm text-muted-foreground mt-1">Tous les jeux de la promo</p>
      </div>

      {/* Sub-tabs — horizontal scroll on mobile */}
      {visibleTabs.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <p className="text-5xl">🎮</p>
          <h2 className="text-xl font-display">Aucun jeu disponible</h2>
          <p className="text-muted-foreground text-sm">Reviens plus tard ! 🦌</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:justify-center">
            {visibleTabs.map(tab => {
              const isActive = activeTab === tab.id;
              const tabSuspended = isSuspended(tab.id);
              const subtitle = getSubtitle(tab);
              const isDisabled = !tab.available || (tabSuspended && !isAdmin);
              return (
                <button
                  key={tab.id}
                  onClick={() => !isDisabled && setActiveTab(tab.id)}
                  disabled={isDisabled}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all text-left min-w-[160px] ${
                    tabSuspended
                      ? 'border-destructive/30 bg-destructive/5 opacity-60 cursor-not-allowed'
                      : isActive
                        ? 'border-primary bg-primary/10 shadow-md'
                        : tab.available
                          ? 'border-border bg-card hover:border-primary/30 hover:bg-secondary/50'
                          : 'border-border/50 bg-muted/30 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="text-2xl">{tab.emoji}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${tabSuspended ? 'text-destructive' : isActive ? 'text-primary' : ''}`}>
                      {tab.label}
                    </p>
                    {tabSuspended ? (
                      <p className="text-[10px] text-destructive flex items-center gap-1">
                        <ShieldAlert className="w-2.5 h-2.5" /> Suspendu
                      </p>
                    ) : subtitle ? (
                      <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>
                    ) : !tab.available ? (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Bientôt
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

      {/* Active game content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {isSuspended(activeTab) && !isAdmin ? (
          <SuspendedMessage />
        ) : (
          <>
            {activeTab === 'kiss-marry' && <KissMarryPage />}
            {activeTab === 'daimocratie' && <SondagePage />}
            {activeTab === 'you-decide' && <TournoiPage />}
            {activeTab === 'gouvernement' && <GouvernementPage />}
            {activeTab === 'fantasy-firm' && <FantasyFirmPage />}
          </>
        )}
      </motion.div>
        </>
      )}
    </div>
  );
}

function SuspendedMessage() {
  return (
    <div className="text-center py-20 space-y-3">
      <p className="text-5xl">🚨</p>
      <h2 className="text-xl font-display text-destructive">Jeu suspendu</h2>
      <p className="text-muted-foreground text-sm">Ce jeu est temporairement suspendu par l'administrateur.</p>
    </div>
  );
}

function ComingSoon({ label, emoji }: { label: string; emoji: string }) {
  return (
    <div className="text-center py-20 space-y-3">
      <p className="text-5xl">{emoji}</p>
      <h2 className="text-xl font-display">{label}</h2>
      <p className="text-muted-foreground text-sm">Ce jeu sera bientôt disponible ! 🦌</p>
    </div>
  );
}

export { GAME_TABS };
