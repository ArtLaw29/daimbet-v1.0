import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Trash2, Play, Square, Archive } from 'lucide-react';
import AdminGlobalReport from './AdminGlobalReport';

const GAME_TYPES = [
  { value: 'sondage', label: '🗳️ Sondage' },
  { value: 'tournoi', label: '⚔️ Tournoi' },
  { value: 'gouvernement', label: '🏛️ Gouvernement' },
  { value: 'fantasy', label: '⚖️ Fantasy Firm' },
] as const;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '📝 Brouillon', color: 'bg-muted text-muted-foreground' },
  active: { label: '🟢 Actif', color: 'bg-primary/20 text-primary' },
  voting: { label: '🗳️ Vote', color: 'bg-accent/20 text-accent-foreground' },
  closed: { label: '🔴 Fermé', color: 'bg-destructive/20 text-destructive' },
  archived: { label: '📦 Archivé', color: 'bg-muted text-muted-foreground' },
};

interface Session {
  id: string;
  game_type: string;
  title: string;
  subtitle: string | null;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  closed_at: string | null;
}

export default function AdminGameSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newType, setNewType] = useState<string>('sondage');
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newOptions, setNewOptions] = useState('');

  const fetchSessions = async () => {
    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .order('created_at', { ascending: false });
    setSessions((data || []) as Session[]);
    setLoading(false);
  };

  useEffect(() => { fetchSessions(); }, []);

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const config: Record<string, unknown> = {};
    if (newDescription.trim()) config.description = newDescription.trim();
    if (newOptions.trim()) {
      config.options = newOptions.split('\n').map(o => o.trim()).filter(Boolean);
    }

    const { error } = await supabase.from('game_sessions').insert([{
      game_type: newType,
      title: newTitle.trim(),
      subtitle: newSubtitle.trim() || null,
      status: 'active',
      config,
    }] as any);

    if (error) { toast.error('Erreur'); return; }
    toast.success('Session créée et active ! 🎉');
    setNewTitle('');
    setNewSubtitle('');
    setNewDescription('');
    setNewOptions('');
    setShowCreate(false);
    fetchSessions();
  };

  const updateStatus = async (id: string, status: string) => {
    const update: Record<string, unknown> = { status };
    if (status === 'closed' || status === 'archived') {
      update.closed_at = new Date().toISOString();
    }
    await supabase.from('game_sessions').update(update).eq('id', id);
    toast.success('Statut mis à jour');
    fetchSessions();
  };

  const deleteSession = async (id: string) => {
    if (!confirm('Supprimer cette session et toutes ses participations ?')) return;
    await supabase.from('game_sessions').delete().eq('id', id);
    toast.success('Session supprimée');
    fetchSessions();
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6">
      <AdminGlobalReport />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display">Sessions de jeux</h2>
        <Button size="sm" className="gold-gradient" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4 mr-1" /> Nouvelle session
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={createSession} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-display">Créer une session</h3>
          <div className="flex flex-wrap gap-2">
            {GAME_TYPES.map(gt => (
              <button key={gt.value} type="button"
                onClick={() => setNewType(gt.value)}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  newType === gt.value ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-secondary/50'
                }`}>
                {gt.label}
              </button>
            ))}
          </div>
          <Input placeholder="Titre de la session" value={newTitle} onChange={e => setNewTitle(e.target.value)} required />
          <Input placeholder="Sous-titre (optionnel)" value={newSubtitle} onChange={e => setNewSubtitle(e.target.value)} />
          <Textarea placeholder="Description (optionnel)" value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={2} />
          <Textarea placeholder="Options (une par ligne, optionnel)" value={newOptions} onChange={e => setNewOptions(e.target.value)} rows={3} />
          <Button type="submit" className="gold-gradient">Créer et activer 🚀</Button>
        </form>
      )}

      {sessions.length === 0 && !showCreate && (
        <p className="text-center text-muted-foreground py-8">Aucune session créée.</p>
      )}

      <div className="space-y-3">
        {sessions.map(session => {
          const statusInfo = STATUS_LABELS[session.status] || STATUS_LABELS.draft;
          const gameLabel = GAME_TYPES.find(g => g.value === session.game_type)?.label || session.game_type;
          return (
            <div key={session.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{gameLabel}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                  </div>
                  <h3 className="font-semibold mt-1">{session.title}</h3>
                  {session.subtitle && <p className="text-xs text-muted-foreground">{session.subtitle}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Créée le {new Date(session.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {session.status === 'draft' && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(session.id, 'active')}>
                    <Play className="w-3 h-3 mr-1" /> Activer
                  </Button>
                )}
                {session.status === 'active' && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(session.id, 'voting')}>
                    🗳️ Passer en vote
                  </Button>
                )}
                {(session.status === 'active' || session.status === 'voting') && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(session.id, 'closed')}>
                    <Square className="w-3 h-3 mr-1" /> Fermer
                  </Button>
                )}
                {session.status === 'closed' && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(session.id, 'archived')}>
                    <Archive className="w-3 h-3 mr-1" /> Archiver
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => deleteSession(session.id)}>
                  <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
