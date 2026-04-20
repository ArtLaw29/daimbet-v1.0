import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Shield } from 'lucide-react';
import AdminHarassmentFlags from './AdminHarassmentFlags';
import { logModerationAction } from '@/lib/moderationLog';

export default function AdminModeration() {
  const [bannedWords, setBannedWords] = useState<{ id: string; word: string }[]>([]);
  const [newWord, setNewWord] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('banned_words').select('id, word').order('word');
    setBannedWords(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const addWord = async () => {
    const w = newWord.trim().toLowerCase();
    if (!w) return;
    const { error } = await supabase.from('banned_words').insert({ word: w });
    if (error) {
      if (error.code === '23505') toast.error('Ce mot existe déjà');
      else toast.error('Erreur');
    } else {
      setNewWord('');
      fetchAll();
      toast.success('Mot ajouté');
    }
  };

  const removeWord = async (id: string) => {
    await supabase.from('banned_words').delete().eq('id', id);
    fetchAll();
    toast.success('Mot supprimé');
  };

  const toggleHide = async (item: ReportedContent) => {
    const newHidden = !item.is_hidden;
    if (item.content_type === 'proposal') {
      await supabase.from('daimocratie_proposals').update({ is_hidden: newHidden }).eq('id', item.content_id);
    } else {
      await supabase.from('game_sessions').update({ is_hidden: newHidden }).eq('id', item.content_id);
    }
    fetchAll();
    toast.success(newHidden ? 'Contenu masqué' : 'Contenu restauré');
  };

  const deleteContent = async (item: ReportedContent) => {
    if (item.content_type === 'proposal') {
      await supabase.from('daimocratie_proposals').delete().eq('id', item.content_id);
    } else {
      await supabase.from('game_sessions').delete().eq('id', item.content_id);
    }
    await supabase.from('content_reports').delete().eq('content_id', item.content_id);
    fetchAll();
    toast.success('Contenu supprimé définitivement');
  };

  return (
    <div className="space-y-8">
      {/* Harassment detection */}
      <AdminHarassmentFlags />

      {/* Banned Words */}
      <div>
        <h3 className="text-lg font-display mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5" /> Mots interdits
        </h3>
        <div className="flex gap-2 mb-3">
          <Input
            value={newWord}
            onChange={e => setNewWord(e.target.value)}
            placeholder="Ajouter un mot interdit..."
            onKeyDown={e => e.key === 'Enter' && addWord()}
            className="max-w-xs"
          />
          <Button size="sm" onClick={addWord} disabled={!newWord.trim()}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {bannedWords.map(w => (
            <span key={w.id} className="inline-flex items-center gap-1 text-xs bg-destructive/10 text-destructive px-2 py-1 rounded-full border border-destructive/20">
              {w.word}
              <button onClick={() => removeWord(w.id)} className="hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
          {bannedWords.length === 0 && <p className="text-sm text-muted-foreground">Aucun mot interdit configuré.</p>}
        </div>
      </div>

      {/* Reported Content */}
      <div>
        <h3 className="text-lg font-display mb-3">🚩 Contenus signalés</h3>
        {reportedContent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun contenu signalé.</p>
        ) : (
          <div className="space-y-3">
            {reportedContent.map(item => (
              <div key={`${item.content_type}_${item.content_id}`}
                className={`rounded-xl border p-4 ${item.is_hidden ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Par {item.author} · {item.content_type === 'proposal' ? 'Proposition' : 'Session'} · 
                      <span className="text-destructive font-medium ml-1">🚩 {item.report_count} signalement(s)</span>
                    </p>
                    {item.is_hidden && (
                      <span className="text-xs text-destructive font-medium">⚠️ Masqué automatiquement</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => toggleHide(item)}>
                      {item.is_hidden ? <><Eye className="w-3 h-3 mr-1" /> Restaurer</> : <><EyeOff className="w-3 h-3 mr-1" /> Masquer</>}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteContent(item)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Supprimer
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
