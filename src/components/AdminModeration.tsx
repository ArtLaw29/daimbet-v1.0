import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Eye, EyeOff, RotateCcw, Shield } from 'lucide-react';
import AdminHarassmentFlags from './AdminHarassmentFlags';

interface Report {
  id: string;
  content_type: string;
  content_id: string;
  reporter_id: string;
  reason: string | null;
  created_at: string;
}

interface ReportedContent {
  content_type: string;
  content_id: string;
  report_count: number;
  is_hidden: boolean;
  title: string;
  author: string;
  reports: Report[];
}

export default function AdminModeration() {
  const [bannedWords, setBannedWords] = useState<{ id: string; word: string }[]>([]);
  const [newWord, setNewWord] = useState('');
  const [reportedContent, setReportedContent] = useState<ReportedContent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const [wordsRes, reportsRes, proposalsRes, sessionsRes, profilesRes] = await Promise.all([
      supabase.from('banned_words').select('id, word').order('word'),
      supabase.from('content_reports').select('*').order('created_at', { ascending: false }),
      supabase.from('daimocratie_proposals').select('id, title, user_id, is_hidden, report_count').gt('report_count', 0),
      supabase.from('game_sessions').select('id, title, created_by, is_hidden, report_count').gt('report_count', 0),
      supabase.from('profiles').select('user_id, display_name'),
    ]);

    setBannedWords(wordsRes.data || []);

    const prMap: Record<string, string> = {};
    (profilesRes.data || []).forEach(p => { prMap[p.user_id] = p.display_name; });
    setProfiles(prMap);

    const reports = reportsRes.data || [];
    const grouped: Record<string, ReportedContent> = {};

    // Group reports by content
    (proposalsRes.data || []).filter(p => p.report_count > 0).forEach(p => {
      grouped[`proposal_${p.id}`] = {
        content_type: 'proposal',
        content_id: p.id,
        report_count: p.report_count,
        is_hidden: p.is_hidden,
        title: p.title,
        author: prMap[p.user_id] || 'Inconnu',
        reports: reports.filter(r => r.content_type === 'proposal' && r.content_id === p.id),
      };
    });

    (sessionsRes.data || []).filter(s => s.report_count > 0).forEach(s => {
      const type = reports.find(r => r.content_id === s.id)?.content_type || 'session';
      grouped[`session_${s.id}`] = {
        content_type: type,
        content_id: s.id,
        report_count: s.report_count,
        is_hidden: s.is_hidden,
        title: s.title,
        author: prMap[s.created_by || ''] || 'Inconnu',
        reports: reports.filter(r => r.content_id === s.id),
      };
    });

    setReportedContent(Object.values(grouped).sort((a, b) => b.report_count - a.report_count));
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
