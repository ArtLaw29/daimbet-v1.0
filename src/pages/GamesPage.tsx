import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import KissMarryPage from './KissMarryPage';

interface GameTab {
  id: string;
  emoji: string;
  label: string;
  subtitleKey: string; // platform_settings key for admin-editable subtitle
  defaultSubtitle: string;
  available: boolean;
}

const GAME_TABS: GameTab[] = [
  { id: 'kiss-marry', emoji: '💋', label: 'Kiss/Marry', subtitleKey: 'game_subtitle_kiss_marry', defaultSubtitle: 'Vote mensuel anonyme', available: true },
  { id: 'daimocratie', emoji: '🗳️', label: 'Daimocratie', subtitleKey: 'game_subtitle_daimocratie', defaultSubtitle: 'Sondages', available: false },
  { id: 'you-decide', emoji: '⚔️', label: 'You Decide', subtitleKey: 'game_subtitle_you_decide', defaultSubtitle: 'Tournois', available: false },
  { id: 'gouvernement', emoji: '🏛️', label: 'Gouvernement', subtitleKey: 'game_subtitle_gouvernement', defaultSubtitle: '', available: false },
  { id: 'fantasy-firm', emoji: '⚖️', label: 'Daim Fantasy Firm', subtitleKey: 'game_subtitle_fantasy_firm', defaultSubtitle: '', available: false },
];

export default function GamesPage() {
  const [activeTab, setActiveTab] = useState('kiss-marry');
  const [subtitles, setSubtitles] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchSubtitles = async () => {
      const keys = GAME_TABS.map(t => t.subtitleKey);
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', keys);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(r => { map[r.key] = r.value; });
        setSubtitles(map);
      }
    };
    fetchSubtitles();
  }, []);

  const getSubtitle = (tab: GameTab) => subtitles[tab.subtitleKey] || tab.defaultSubtitle;

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-display gold-text">🎮 Jeux</h1>
        <p className="text-sm text-muted-foreground mt-1">Tous les jeux de la promo</p>
      </div>

      {/* Sub-tabs — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:justify-center">
        {GAME_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const subtitle = getSubtitle(tab);
          return (
            <button
              key={tab.id}
              onClick={() => tab.available && setActiveTab(tab.id)}
              disabled={!tab.available}
              className={`flex-shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all text-left min-w-[160px] ${
                isActive
                  ? 'border-primary bg-primary/10 shadow-md'
                  : tab.available
                    ? 'border-border bg-card hover:border-primary/30 hover:bg-secondary/50'
                    : 'border-border/50 bg-muted/30 opacity-50 cursor-not-allowed'
              }`}
            >
              <span className="text-2xl">{tab.emoji}</span>
              <div className="min-w-0">
                <p className={`text-sm font-semibold truncate ${isActive ? 'text-primary' : ''}`}>
                  {tab.label}
                </p>
                {subtitle && (
                  <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>
                )}
                {!tab.available && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Bientôt
                  </p>
                )}
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
        {activeTab === 'kiss-marry' && <KissMarryPage />}
        {activeTab === 'daimocratie' && <ComingSoon label="Daimocratie — Sondages" emoji="🗳️" />}
        {activeTab === 'you-decide' && <ComingSoon label="You Decide — Tournois" emoji="⚔️" />}
        {activeTab === 'gouvernement' && <ComingSoon label="Gouvernement" emoji="🏛️" />}
        {activeTab === 'fantasy-firm' && <ComingSoon label="Daim Fantasy Firm" emoji="⚖️" />}
      </motion.div>
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
