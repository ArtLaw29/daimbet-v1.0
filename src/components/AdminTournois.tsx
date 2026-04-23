import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Trash2, Play, ChevronDown, ChevronUp, Swords, Loader2 } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

interface Session {
  id: string;
  game_type: string;
  title: string;
  subtitle: string | null;
  status: string;
  config: Record<string, any>;
  created_at: string;
  closed_at: string | null;
}

interface Participation {
  id: string;
  session_id: string;
  user_id: string;
  data: Record<string, any>;
  created_at: string;
}

interface Profile {
  user_id: string;
  display_name: string;
  emoji: string | null;
}

export default function AdminTournois() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [participations, setParticipations] = useState<Record<string, Participation[]>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newOptions, setNewOptions] = useState('');
  const [addOptionInput, setAddOptionInput] = useState<Record<string, string>>({});

  const fetchAll = async () => {
    const { data: sessData } = await supabase.from('game_sessions').select('*')
      .eq('game_type', 'tournoi').order('created_at', { ascending: false });
    const items = (sessData || []) as Session[];
    setSessions(items);

    if (items.length > 0) {
      const ids = items.map(s => s.id);
      const [partsRes, profilesRes] = await Promise.all([
        supabase.from('game_participations').select('*').in('session_id', ids),
        (supabase as any).from('profiles_public').select('user_id, display_name, emoji'),
      ]);
      const partsMap: Record<string, Participation[]> = {};
      (partsRes.data as Participation[] || []).forEach(p => {
        if (!partsMap[p.session_id]) partsMap[p.session_id] = [];
        partsMap[p.session_id].push(p);
      });
      setParticipations(partsMap);
      const prMap: Record<string, Profile> = {};
      (profilesRes.data || []).forEach(p => { prMap[p.user_id] = p as Profile; });
      setProfiles(prMap);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const createTournoi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const config: Record<string, any> = {};
    if (newDescription.trim()) config.description = newDescription.trim();
    if (newOptions.trim()) {
      config.options = newOptions.split('\n').map(o => o.trim()).filter(Boolean);
    }
    const { error } = await supabase.from('game_sessions').insert([{
      game_type: 'tournoi' as any,
      title: newTitle.trim(),
      subtitle: newSubtitle.trim() || null,
      status: 'active' as any,
      config,
    }] as any);
    if (error) { toast.error('Erreur'); return; }
    await supabase.from('gazette_messages').insert({
      content: `⚔️ Nouveau tournoi : "${newTitle.trim()}" — Venez voter !`,
      is_system_message: true,
    } as any);
    toast.success('Tournoi créé ! ⚔️');
    setNewTitle(''); setNewSubtitle(''); setNewDescription(''); setNewOptions('');
    setShowCreate(false);
    fetchAll();
  };

  const addOption = async (session: Session) => {
    const val = addOptionInput[session.id]?.trim();
    if (!val) return;
    const opts = [...((session.config?.options as string[]) || []), val];
    await supabase.from('game_sessions').update({
      config: { ...session.config, options: opts } as unknown as Json,
    }).eq('id', session.id);
    setAddOptionInput(prev => ({ ...prev, [session.id]: '' }));
    toast.success('Choix ajouté');
    fetchAll();
  };

  const removeOption = async (session: Session, opt: string) => {
    const opts = ((session.config?.options as string[]) || []).filter(o => o !== opt);
    await supabase.from('game_sessions').update({
      config: { ...session.config, options: opts } as unknown as Json,
    }).eq('id', session.id);
    toast.success('Choix supprimé');
    fetchAll();
  };

  const generateBracket = async (session: Session) => {
    const options = (session.config?.options as string[]) || [];
    if (options.length < 2) { toast.error('Il faut au moins 2 choix'); return; }

    // Shuffle options randomly
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    const duels: any[] = [];
    let duelId = 0;
    for (let i = 0; i < shuffled.length; i += 2) {
      duels.push({
        id: duelId++,
        a: shuffled[i],
        b: i + 1 < shuffled.length ? shuffled[i + 1] : null,
        winner: i + 1 >= shuffled.length ? shuffled[i] : null, // bye
        votes: {},
      });
    }

    const rounds = [{ round: 1, duels, status: 'voting' }];
    await supabase.from('game_sessions').update({
      config: { ...session.config, rounds, current_round: 1 } as unknown as Json,
      status: 'voting' as any,
    }).eq('id', session.id);
    toast.success('Bracket généré et votes ouverts ! ⚔️');
    fetchAll();
  };

  const advanceRound = async (session: Session) => {
    const rounds = (session.config?.rounds as any[]) || [];
    const currentRoundIdx = rounds.findIndex((r: any) => r.status === 'voting');
    if (currentRoundIdx === -1) return;

    const current = rounds[currentRoundIdx];
    // Resolve all unresolved duels
    const resolvedDuels = current.duels.map((d: any) => {
      if (d.winner) return d;
      const votes = d.votes || {};
      const countA = Object.values(votes).filter(v => v === d.a).length;
      const countB = Object.values(votes).filter(v => v === d.b).length;
      let winner;
      if (countA > countB) winner = d.a;
      else if (countB > countA) winner = d.b;
      else winner = Math.random() < 0.5 ? d.a : d.b; // Tiebreaker
      return { ...d, winner };
    });

    current.duels = resolvedDuels;
    current.status = 'resolved';

    // Get winners for next round
    const winners = resolvedDuels.map((d: any) => d.winner);

    if (winners.length <= 1) {
      // Tournament over
      const finalWinner = winners[0];
      const updatedConfig = {
        ...session.config,
        rounds,
        tournament_winner: finalWinner,
        current_round: null,
      };
      await supabase.from('game_sessions').update({
        config: updatedConfig as unknown as Json,
      }).eq('id', session.id);

      // Resolve and distribute
      setResolving(session.id);
      await supabase.rpc('resolve_tournoi', { p_session_id: session.id });
      setResolving(null);
      toast.success(`Tournoi terminé ! Vainqueur : ${finalWinner} 🏆`);
    } else {
      // Create next round
      const nextDuels: any[] = [];
      let duelId = 0;
      for (let i = 0; i < winners.length; i += 2) {
        nextDuels.push({
          id: duelId++,
          a: winners[i],
          b: i + 1 < winners.length ? winners[i + 1] : null,
          winner: i + 1 >= winners.length ? winners[i] : null,
          votes: {},
        });
      }
      const nextRound = current.round + 1;
      rounds.push({ round: nextRound, duels: nextDuels, status: 'voting' });

      await supabase.from('game_sessions').update({
        config: { ...session.config, rounds, current_round: nextRound } as unknown as Json,
      }).eq('id', session.id);
      toast.success(`Tour ${nextRound} lancé ! ⚔️`);
    }
    fetchAll();
  };

  const deleteSession = async (id: string) => {
    if (!confirm('Supprimer ce tournoi et toutes les participations ?')) return;
    await supabase.from('game_sessions').delete().eq('id', id);
    toast.success('Tournoi supprimé');
    fetchAll();
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display">⚔️ Tournois</h2>
        <Button size="sm" className="gold-gradient" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4 mr-1" /> Nouveau tournoi
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={createTournoi} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-display">Créer un tournoi</h3>
          <Input placeholder="Titre / Question" value={newTitle} onChange={e => setNewTitle(e.target.value)} required />
          <Input placeholder="Sous-titre (optionnel)" value={newSubtitle} onChange={e => setNewSubtitle(e.target.value)} />
          <Textarea placeholder="Description (optionnel)" value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={2} />
          <Textarea placeholder="Choix (un par ligne)" value={newOptions} onChange={e => setNewOptions(e.target.value)} rows={4} />
          <Button type="submit" className="gold-gradient">Créer et activer ⚔️</Button>
        </form>
      )}

      {sessions.length === 0 && !showCreate && (
        <p className="text-center text-muted-foreground py-8">Aucun tournoi.</p>
      )}

      {sessions.map(session => {
        const isExpanded = expandedId === session.id;
        const parts = participations[session.id] || [];
        const options = (session.config?.options as string[]) || [];
        const rounds = (session.config?.rounds as any[]) || [];
        const currentRound = rounds.find((r: any) => r.status === 'voting');
        const isClosed = session.status === 'closed' || session.status === 'archived';

        return (
          <div key={session.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <button onClick={() => setExpandedId(isExpanded ? null : session.id)}
              className="w-full text-left p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    isClosed ? 'bg-destructive/20 text-destructive' :
                    currentRound ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {isClosed ? '🔴 Fermé' : currentRound ? `⚔️ Tour ${currentRound.round}` : '🎯 Mises ouvertes'}
                  </span>
                  <span className="text-xs text-muted-foreground">{parts.length} participant(s)</span>
                </div>
                <h3 className="font-semibold mt-1">{session.title}</h3>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isExpanded && (
              <div className="p-4 border-t border-border space-y-4">
                {/* Options */}
                <div>
                  <p className="text-sm font-semibold mb-2">Choix ({options.length})</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {options.map(opt => (
                      <span key={opt} className="inline-flex items-center gap-1 px-2 py-1 bg-secondary/50 rounded text-xs border border-border">
                        {opt}
                        {!isClosed && (
                          <button onClick={() => removeOption(session, opt)} className="text-destructive hover:text-destructive/80">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {!isClosed && (
                    <div className="flex gap-2">
                      <Input placeholder="Ajouter un choix" value={addOptionInput[session.id] || ''}
                        onChange={e => setAddOptionInput(prev => ({ ...prev, [session.id]: e.target.value }))}
                        className="flex-1" />
                      <Button size="sm" variant="outline" onClick={() => addOption(session)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Pronostics */}
                {parts.filter(p => p.data?.predicted_winner).length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">🎯 Pronostics</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {parts.filter(p => p.data?.predicted_winner).map(p => {
                        const pr = profiles[p.user_id];
                        return (
                          <div key={p.id} className="flex items-center justify-between text-xs bg-secondary/30 rounded px-2 py-1">
                            <span>{pr?.emoji || '🦌'} {pr?.display_name || 'Inconnu'}</span>
                            <span className="font-semibold">{p.data.predicted_winner} ({p.data.bet_amount || 0} DC)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Bracket duels info */}
                {currentRound && (
                  <div>
                    <p className="text-sm font-semibold mb-2">⚔️ Tour {currentRound.round} — Votes</p>
                    {currentRound.duels.filter((d: any) => !d.winner || Object.keys(d.votes || {}).length > 0).map((d: any) => (
                      <div key={d.id} className="text-xs bg-secondary/30 rounded px-3 py-2 mb-1">
                        <span>{d.a} vs {d.b || 'BYE'}</span>
                        <span className="ml-2 text-muted-foreground">
                          ({Object.values(d.votes || {}).filter(v => v === d.a).length} - {Object.values(d.votes || {}).filter(v => v === d.b).length})
                        </span>
                        {d.winner && <span className="ml-2 text-primary font-semibold">→ {d.winner}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {!isClosed && !currentRound && rounds.length === 0 && options.length >= 2 && (
                    <Button size="sm" variant="outline" onClick={() => generateBracket(session)}>
                      <Swords className="w-3 h-3 mr-1" /> Générer le bracket
                    </Button>
                  )}
                  {currentRound && (
                    <Button size="sm" variant="outline" onClick={() => advanceRound(session)}
                      disabled={resolving === session.id}>
                      {resolving === session.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> :
                        <Play className="w-3 h-3 mr-1" />}
                      Résoudre & tour suivant
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => deleteSession(session.id)}>
                    <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
