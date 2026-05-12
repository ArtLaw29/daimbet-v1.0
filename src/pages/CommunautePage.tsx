import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import GazettePage from './GazettePage';
import LeaderboardPage from './LeaderboardPage';
import { useUnreadGazette } from '@/hooks/useUnreadGazette';

export default function CommunautePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initial = (location.state as any)?.tab === 'gazette' ? 'gazette' : 'classement';
  const [tab, setTab] = useState<string>(initial);
  const { hasUnreadGazette, markAsRead } = useUnreadGazette();

  useEffect(() => {
    if (tab === 'gazette') {
      markAsRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    const t = (location.state as any)?.tab;
    if (t === 'gazette' || t === 'classement') setTab(t);
  }, [location.state]);

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6">
      <Tabs value={tab} onValueChange={(v) => { setTab(v); navigate('/communaute', { replace: true, state: { tab: v } }); if (v === 'gazette') markAsRead(); }}>
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-4">
          <TabsTrigger value="classement">🏆 Classement</TabsTrigger>
          <TabsTrigger value="gazette" className="relative">
            📰 Gazette
            {hasUnreadGazette && tab !== 'gazette' && (
              <span className="absolute top-1 right-2 w-2 h-2 bg-destructive rounded-full ring-2 ring-background" aria-label="Nouveau message" />
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="classement"><LeaderboardPage /></TabsContent>
        <TabsContent value="gazette"><GazettePage /></TabsContent>
      </Tabs>
    </div>
  );
}