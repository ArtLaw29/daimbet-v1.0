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

  const fetchAll = async () => {
    const { data } = await supabase.from('banned_words').select('id, word').order('word');
    setBannedWords(data || []);
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
      logModerationAction({
        action_type: 'modification',
        target_type: 'autre',
        description: `Mot interdit ajouté : "${w}"`,
      });
    }
  };

  const removeWord = async (id: string, word: string) => {
    await supabase.from('banned_words').delete().eq('id', id);
    fetchAll();
    toast.success('Mot supprimé');
    logModerationAction({
      action_type: 'suppression',
      target_type: 'autre',
      description: `Mot interdit supprimé : "${word}"`,
    });
  };

  return (
    <div className="space-y-8">
      <AdminHarassmentFlags />

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
              <button onClick={() => removeWord(w.id, w.word)} className="hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
          {bannedWords.length === 0 && <p className="text-sm text-muted-foreground">Aucun mot interdit configuré.</p>}
        </div>
      </div>
    </div>
  );
}
