import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Users, Clock, CheckCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Json } from '@/integrations/supabase/types';

interface GameSession {
  id: string;
  game_type: string;
  title: string;
  subtitle: string | null;
  status: string;
  config: Json;
  created_at: string;
  closed_at: string | null;
}

interface GameParticipation {
  id: string;
  session_id: string;
  user_id: string;
  data: Json;
  created_at: string;
}

interface Props {
  gameType: 'sondage' | 'tournoi' | 'gouvernement' | 'fantasy';
  emoji: string;
  label: string;
}

export default function GameSessionsList({ gameType, emoji, label }: Props) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [participationCounts, setParticipationCounts] = useState<Record<string, number>>({});
  const [userParticipations, setUserParticipations] = useState<Record<string, GameParticipation>>({});
  const [selectedSession, setSelectedSession] = useState<GameSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [voteInput, setVoteInput] = useState('');

  const fetchSessions = async () => {
    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('game_type', gameType)
      .in('status', ['active', 'voting'])
      .order('created_at', { ascending: false });
    const items = (data || []) as GameSession[];
    setSessions(items);

    if (items.length > 0) {
      const sessionIds = items.map(s => s.id);
      
      // Get participation counts
      const { data: allParts } = await supabase
        .from('game_participations')
        .select('session_id')
        .in('session_id', sessionIds);
      
      const counts: Record<string, number> = {};
      (allParts || []).forEach(p => {
        counts[p.session_id] = (counts[p.session_id] || 0) + 1;
      });
      setParticipationCounts(counts);

      // Get user's participations
      if (user) {
        const { data: myParts } = await supabase
          .from('game_participations')
          .select('*')
          .in('session_id', sessionIds)
          .eq('user_id', user.id);
        const userMap: Record<string, GameParticipation> = {};
        (myParts || []).forEach(p => {
          userMap[p.session_id] = p as GameParticipation;
        });
        setUserParticipations(userMap);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();

    // Realtime subscriptions
    const channel = supabase
      .channel(`game-sessions-${gameType}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, () => fetchSessions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_participations' }, () => fetchSessions())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameType, user]);

  const submitParticipation = async (sessionId: string) => {
    if (!user || !voteInput.trim()) return;
    
    const { error } = await supabase.from('game_participations').insert({
      session_id: sessionId,
      user_id: user.id,
      data: { vote: voteInput.trim() },
    });

    if (error) {
      if (error.code === '23505') {
        toast.error('Tu as déjà participé à cette session !');
      } else {
        toast.error('Erreur lors de la participation');
      }
      return;
    }

    toast.success('Participation enregistrée ! 🎉');
    setVoteInput('');
    fetchSessions();
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Chargement...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-5xl">{emoji}</p>
        <h2 className="text-xl font-display">{label}</h2>
        <p className="text-muted-foreground text-sm">Aucune session active pour le moment. Revenez bientôt ! 🦌</p>
      </div>
    );
  }

  // Detail view
  if (selectedSession) {
    const config = selectedSession.config as Record<string, unknown>;
    const hasParticipated = !!userParticipations[selectedSession.id];
    const count = participationCounts[selectedSession.id] || 0;

    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedSession(null)} className="text-sm text-primary hover:underline">
          ← Retour aux sessions
        </button>
        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <h2 className="text-xl font-display">{selectedSession.title}</h2>
          {selectedSession.subtitle && <p className="text-sm text-muted-foreground mt-1">{selectedSession.subtitle}</p>}
          {config?.description && <p className="text-sm mt-3">{String(config.description)}</p>}
          
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {count} participant{count > 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> 
              {selectedSession.status === 'active' ? 'En cours' : selectedSession.status === 'voting' ? 'Phase de vote' : selectedSession.status}
            </span>
          </div>

          {/* Options display for sondage */}
          {config?.options && Array.isArray(config.options) && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold">Options :</p>
              {(config.options as string[]).map((opt, i) => (
                <div key={i} className="px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm">
                  {opt}
                </div>
              ))}
            </div>
          )}

          {/* Participation */}
          {hasParticipated ? (
            <div className="mt-6 flex items-center gap-2 text-primary text-sm">
              <CheckCircle className="w-4 h-4" /> Tu as déjà participé à cette session
            </div>
          ) : selectedSession.status === 'active' || selectedSession.status === 'voting' ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm font-semibold">Ta participation :</p>
              {config?.options && Array.isArray(config.options) ? (
                <div className="flex flex-wrap gap-2">
                  {(config.options as string[]).map((opt, i) => (
                    <Button key={i} variant={voteInput === opt ? 'default' : 'outline'} size="sm"
                      onClick={() => setVoteInput(opt)}>
                      {opt}
                    </Button>
                  ))}
                </div>
              ) : (
                <Textarea
                  placeholder="Ta réponse..."
                  value={voteInput}
                  onChange={e => setVoteInput(e.target.value)}
                  rows={2}
                />
              )}
              <Button className="gold-gradient" disabled={!voteInput.trim()}
                onClick={() => submitParticipation(selectedSession.id)}>
                Valider 🦌
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <p className="text-4xl">{emoji}</p>
        <h2 className="text-xl font-display mt-1">{label}</h2>
        <p className="text-sm text-muted-foreground">{sessions.length} session{sessions.length > 1 ? 's' : ''} active{sessions.length > 1 ? 's' : ''}</p>
      </div>

      {sessions.map((session, i) => {
        const count = participationCounts[session.id] || 0;
        const hasParticipated = !!userParticipations[session.id];
        return (
          <motion.button
            key={session.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setSelectedSession(session)}
            className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-secondary/30 transition-all flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{session.title}</h3>
              {session.subtitle && <p className="text-xs text-muted-foreground truncate">{session.subtitle}</p>}
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {count}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  session.status === 'active' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {session.status === 'active' ? '🟢 En cours' : '🗳️ Vote'}
                </span>
                {hasParticipated && (
                  <span className="flex items-center gap-0.5 text-primary"><CheckCircle className="w-3 h-3" /> Fait</span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </motion.button>
        );
      })}
    </div>
  );
}
