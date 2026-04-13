import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Trash2, Eye, Trophy, Users, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Session {
  id: string;
  title: string;
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
}

export default function AdminSondages() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newOptions, setNewOptions] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newBonus, setNewBonus] = useState('');

  // Delete option modal
  const [deleteOptionModal, setDeleteOptionModal] = useState<{ sessionId: string; option: string } | null>(null);

  const fetchSessions = async () => {
    const { data } = await supabase.from('game_sessions').select('*').eq('game_type', 'sondage').order('created_at', { ascending: false });
    setSessions((data || []) as Session[]);
    setLoading(false);
  };

  const fetchParticipations = async (sessionId: string) => {
    const { data } = await supabase.from('game_participations').select('*').eq('session_id', sessionId);
    const parts = (data || []) as Participation[];
    setParticipations(parts);

    const userIds = [...new Set(parts.map(p => p.user_id))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      const map: Record<string, string> = {};
      (profs || []).forEach(p => { map[p.user_id] = p.display_name; });
      setProfiles(map);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  useEffect(() => {
    if (selectedId) fetchParticipations(selectedId);
  }, [selectedId]);

  const createSondage = async () => {
    if (!newTitle.trim()) return;
    const config: Record<string, unknown> = {};
    if (newOptions.trim()) config.options = newOptions.split('\n').map(o => o.trim()).filter(Boolean);
    if (newEndDate) config.end_date = new Date(newEndDate).toISOString();
    if (newBonus) config.bonus_amount = parseInt(newBonus);

    await supabase.from('game_sessions').insert([{ game_type: 'sondage' as any, title: newTitle.trim(), status: 'active' as any, config }] as any);
    await supabase.from('gazette_messages').insert({ content: `🗳️ Nouveau sondage : "${newTitle.trim()}" — Venez voter !`, is_system_message: true });
    toast.success('Sondage créé !');
    setNewTitle(''); setNewOptions(''); setNewEndDate(''); setNewBonus('');
    setShowCreate(false);
    fetchSessions();
  };

  const resolveSondage = async (sessionId: string) => {
    if (!confirm('Clôturer et révéler les résultats ?')) return;
    setResolving(true);
    const { data } = await supabase.rpc('resolve_sondage', { p_session_id: sessionId });
    setResolving(false);
    const res = data as any;
    if (res?.error) { toast.error(res.error); return; }
    toast.success(`Sondage résolu ! #1 : ${res?.winner}`);
    fetchSessions();
  };

  const deleteOption = async () => {
    if (!deleteOptionModal) return;
    const { sessionId, option } = deleteOptionModal;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Find affected participations
    const affected = participations.filter(p => p.data?.vote === option);

    // Refund each
    for (const p of affected) {
      const amt = p.data?.bet_amount || 0;
      if (amt > 0) {
        await supabase.from('profiles').update({ balance: (await supabase.from('profiles').select('balance').eq('user_id', p.user_id).single()).data!.balance + amt }).eq('user_id', p.user_id);
        await supabase.from('solde_history').insert({ user_id: p.user_id, delta_dc: amt, reason: `Remboursement option supprimée: ${option}` });
      }
      await supabase.from('game_participations').delete().eq('id', p.id);
    }

    // Remove option from config
    const newOptions = ((session.config?.options as string[]) || []).filter(o => o !== option);
    await supabase.from('game_sessions').update({ config: { ...session.config, options: newOptions } }).eq('id', sessionId);

    toast.success(`Option "${option}" supprimée, ${affected.length} vote(s) remboursé(s)`);
    setDeleteOptionModal(null);
    fetchSessions();
    fetchParticipations(sessionId);
  };

  const addOption = async (sessionId: string) => {
    const opt = prompt('Nouvelle option :');
    if (!opt?.trim()) return;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const opts = [...((session.config?.options as string[]) || []), opt.trim()];
    await supabase.from('game_sessions').update({ config: { ...session.config, options: opts } }).eq('id', sessionId);
    toast.success('Option ajoutée');
    fetchSessions();
  };

  const updateBonus = async (sessionId: string) => {
    const val = prompt('Nouveau montant du bonus (DC) :');
    if (!val) return;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    await supabase.from('game_sessions').update({ config: { ...session.config, bonus_amount: parseInt(val) } }).eq('id', sessionId);
    toast.success('Bonus mis à jour');
    fetchSessions();
  };

  const deleteSondage = async (id: string) => {
    if (!confirm('Supprimer ce sondage et rembourser tous les participants ?')) return;
    // Refund all
    const { data: parts } = await supabase.from('game_participations').select('*').eq('session_id', id);
    for (const p of (parts || []) as Participation[]) {
      const amt = p.data?.bet_amount || 0;
      if (amt > 0) {
        const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', p.user_id).single();
        if (prof) await supabase.from('profiles').update({ balance: prof.balance + amt }).eq('user_id', p.user_id);
      }
    }
    await supabase.from('game_sessions').delete().eq('id', id);
    toast.success('Sondage supprimé et mises remboursées');
    setSelectedId(null);
    fetchSessions();
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;

  const selected = sessions.find(s => s.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display">🗳️ Gestion des sondages</h2>
        <Button size="sm" className="gold-gradient" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4 mr-1" /> Nouveau sondage
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Input placeholder="Question du sondage" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          <Textarea placeholder="Options (une par ligne)" value={newOptions} onChange={e => setNewOptions(e.target.value)} rows={4} />
          <Input type="datetime-local" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
          <Input placeholder="Montant bonus pronostic (DC, optionnel)" type="number" value={newBonus} onChange={e => setNewBonus(e.target.value)} />
          <Button className="gold-gradient" onClick={createSondage} disabled={!newTitle.trim()}>Créer 🚀</Button>
        </div>
      )}

      {/* Session list */}
      <div className="space-y-3">
        {sessions.map(s => {
          const isSelected = s.id === selectedId;
          const isActive = s.status === 'active' || s.status === 'voting';
          return (
            <div key={s.id} className={`rounded-xl border p-4 space-y-3 ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
              <div className="flex items-start justify-between cursor-pointer" onClick={() => setSelectedId(isSelected ? null : s.id)}>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-xs text-muted-foreground">{s.status} • {new Date(s.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <Eye className="w-4 h-4 text-muted-foreground" />
              </div>

              {isSelected && (
                <div className="space-y-4 pt-2 border-t border-border">
                  {/* Options management */}
                  <div>
                    <p className="text-sm font-semibold mb-2">Options :</p>
                    <div className="flex flex-wrap gap-2">
                      {((s.config?.options as string[]) || []).map(opt => (
                        <div key={opt} className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-sm">
                          {opt}
                          {isActive && (
                            <button className="text-destructive hover:text-destructive/80" onClick={() => setDeleteOptionModal({ sessionId: s.id, option: opt })}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      {isActive && (
                        <Button size="sm" variant="outline" onClick={() => addOption(s.id)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Participations & pronostics */}
                  <div>
                    <p className="text-sm font-semibold mb-2">
                      <Users className="w-4 h-4 inline mr-1" /> {participations.length} participant(s)
                    </p>
                    {participations.length > 0 && (
                      <div className="max-h-60 overflow-y-auto space-y-1">
                        {participations.map(p => (
                          <div key={p.id} className="text-xs flex items-center justify-between px-2 py-1 rounded bg-secondary/50">
                            <span className="font-medium">{profiles[p.user_id] || 'Inconnu'}</span>
                            <span>Vote: <b>{p.data?.vote}</b> • Prono: <b>{p.data?.pronostic}</b> • Mise: <b>{p.data?.bet_amount} DC</b></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bonus info */}
                  <div className="flex items-center gap-3 text-sm">
                    <span>Bonus pronostic : <b>{s.config?.bonus_amount || 'Pot total'} DC</b></span>
                    <Button size="sm" variant="outline" onClick={() => updateBonus(s.id)}>Modifier</Button>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {isActive && (
                      <Button size="sm" className="gold-gradient" onClick={() => resolveSondage(s.id)} disabled={resolving}>
                        {resolving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trophy className="w-3 h-3 mr-1" />}
                        Clôturer et révéler
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => deleteSondage(s.id)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                    </Button>
                  </div>

                  {/* Results if closed */}
                  {s.config?.results && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Résultats :</p>
                      {(s.config.results as any[]).map((r: any) => (
                        <div key={r.option} className={`text-xs px-2 py-1 rounded ${r.option === s.config?.winner_option ? 'bg-primary/20 text-primary font-bold' : 'bg-secondary/50'}`}>
                          {r.option === s.config?.winner_option ? '🏆 ' : ''}{r.option} — {r.count} vote(s) ({r.total_bet} DC)
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete option modal */}
      <Dialog open={!!deleteOptionModal} onOpenChange={() => setDeleteOptionModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l'option "{deleteOptionModal?.option}" ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Les votes et mises sur cette option seront annulés et remboursés. Les utilisateurs concernés pourront voter à nouveau.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOptionModal(null)}>Annuler</Button>
            <Button variant="destructive" onClick={deleteOption}>Supprimer et rembourser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
