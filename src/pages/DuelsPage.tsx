import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Swords, KeyRound, Beer, Coins, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

const GAMES = [
  { id: 'pendu', label: '🪢 Pendu', route: 'pendu' },
  { id: 'puissance4', label: '🔴 Puissance 4', route: 'puissance4' },
  { id: 'echecs', label: '♟️ Échecs', route: 'echecs' },
];

const GAME_EMOJI: Record<string, string> = { pendu: '🪢', puissance4: '🔴', echecs: '♟️' };
const GAME_LABEL: Record<string, string> = { pendu: 'Pendu', puissance4: 'Puissance 4', echecs: 'Échecs' };

const CHESS_MODES = [
  { id: 'blitz', label: 'Blitz · 5 min' },
  { id: 'normal', label: 'Normal · 15 min' },
  { id: 'infini', label: 'Infini · 24h/coup' },
];

export default function DuelsPage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [game, setGame] = useState('pendu');
  const [mise, setMise] = useState(50);
  const [chessMode, setChessMode] = useState('normal');
  const [creating, setCreating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const create = async () => {
    if (!user) return;
    if (mise < 1) return toast.error('Mise minimum : 1 DC');
    setCreating(true);
    const config = game === 'echecs' ? { mode: chessMode } : {};
    const { data, error } = await supabase.rpc('create_challenge', {
      p_game_type: game, p_mise: Math.floor(mise), p_config: config,
    });
    setCreating(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error || error?.message);
    setGeneratedCode((data as any).code);
    await refreshProfile();
  };

  const join = async () => {
    const code = joinCode.trim();
    if (!/^\d{6}$/.test(code)) return toast.error('Code à 6 chiffres requis');
    setJoining(true);
    const { data, error } = await supabase.rpc('join_challenge', { p_code: code });
    setJoining(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error || error?.message);
    const d = data as any;
    await refreshProfile();
    toast.success('Défi rejoint !');
    navigate(`/jeux/${d.game_type}/${d.session_id}`);
  };

  const joinByCode = async (code: string): Promise<void> => {
    const { data, error } = await supabase.rpc('join_challenge', { p_code: code });
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message); return; }
    const d = data as any;
    await refreshProfile();
    toast.success('Défi relevé !');
    navigate(`/jeux/${d.game_type}/${d.session_id}`);
  };

  const copyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    toast.success('Code copié !');
  };

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-2xl">
      <button onClick={() => navigate('/jeux')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Retour aux jeux
      </button>
      <div className="text-center mb-6">
        <h1 className="text-4xl font-display gold-text">⚔️ Duels</h1>
        <p className="text-sm text-muted-foreground mt-1">Défie un Daim au Pendu, Puissance 4 ou Échecs</p>
      </div>

      <Card className="p-5 mb-5 border-primary/30">
        <h2 className="font-display text-xl mb-3 flex items-center gap-2"><Swords className="w-5 h-5 text-primary" /> Lancer un défi</h2>
        <div className="space-y-3">
          <div>
            <Label>Jeu</Label>
            <Select value={game} onValueChange={setGame}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GAMES.map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {game === 'echecs' && (
            <div>
              <Label>Mode</Label>
              <Select value={chessMode} onValueChange={setChessMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHESS_MODES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Mise (DC)</Label>
            <Input type="number" min={1} value={mise} onChange={(e) => setMise(Number(e.target.value))} />
          </div>
          <Button onClick={create} disabled={creating} className="w-full">Générer un code de défi</Button>
          <p className="text-[11px] text-muted-foreground text-center">Le code est valable 30 minutes. Ta mise est débitée immédiatement.</p>
        </div>
      </Card>

      <Saloon onJoin={joinByCode} />

      <Card className="p-5">
        <h2 className="font-display text-xl mb-3 flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" /> Rejoindre un défi</h2>
        <div className="space-y-3">
          <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Code à 6 chiffres" inputMode="numeric" className="font-mono text-2xl text-center tracking-widest h-14" />
          <Button onClick={join} disabled={joining} className="w-full">Rejoindre</Button>
        </div>
      </Card>

      <Dialog open={!!generatedCode} onOpenChange={(o) => !o && setGeneratedCode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🎉 Défi prêt !</DialogTitle>
            <DialogDescription>Partage ce code à ton adversaire. Il expirera dans 30 minutes.</DialogDescription>
          </DialogHeader>
          <div className="text-center py-4">
            <p className="text-5xl font-mono font-bold gold-text tracking-widest">{generatedCode}</p>
          </div>
          <Button onClick={copyCode} className="w-full"><Copy className="w-4 h-4 mr-2" /> Copier le code</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// ───────── Saloon : défis ouverts en temps réel ─────────
type Challenge = {
  id: string;
  code: string;
  game_type: string;
  mise: number;
  status: string;
  creator_id: string;
  expires_at: string | null;
  created_at: string;
};

function Saloon({ onJoin }: { onJoin: (code: string) => Promise<void> }) {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [names, setNames] = useState<Record<string, { display_name: string; emoji: string | null }>>({});
  const [now, setNow] = useState(Date.now());
  const [joining, setJoining] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('challenges')
      .select('*')
      .eq('status', 'ouvert')
      .order('created_at', { ascending: false });
    const rows = (data || []) as Challenge[];
    const filtered = rows.filter(c => c.creator_id !== user?.id && (!c.expires_at || new Date(c.expires_at).getTime() > Date.now()));
    setChallenges(filtered);
    const ids = Array.from(new Set(filtered.map(c => c.creator_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles_public' as any)
        .select('user_id, display_name, emoji')
        .in('user_id', ids);
      const m: Record<string, any> = {};
      (profs || []).forEach((p: any) => { m[p.user_id] = p; });
      setNames(m);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('saloon-challenges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, () => load())
      .subscribe();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [user?.id]);

  const handleJoin = async (c: Challenge) => {
    setJoining(c.id);
    await onJoin(c.code);
    setJoining(null);
  };

  const formatLeft = (expires: string | null) => {
    if (!expires) return '∞';
    const ms = new Date(expires).getTime() - now;
    if (ms <= 0) return 'expiré';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}m${s.toString().padStart(2, '0')}s`;
  };

  return (
    <Card className="p-5 mb-5 border-primary/30">
      <h2 className="font-display text-xl mb-3 flex items-center gap-2">
        <Beer className="w-5 h-5 text-primary" /> Le Saloon
        <span className="text-xs font-normal text-muted-foreground">· défis ouverts</span>
      </h2>
      {challenges.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          🌵 Aucun défi en attente pour l'instant.
        </p>
      ) : (
        <div className="space-y-2">
          {challenges.map(c => {
            const name = names[c.creator_id];
            const display = name ? `${name.emoji || '🦌'} ${name.display_name}` : '?';
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card/50 hover:border-primary/40 transition-all animate-fade-in">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="text-lg">{GAME_EMOJI[c.game_type] || '🎮'}</span>
                    <span className="truncate">{GAME_LABEL[c.game_type] || c.game_type}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    par {display}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] mt-1">
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <Coins className="w-3 h-3" /> {c.mise} DC
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" /> {formatLeft(c.expires_at)}
                    </span>
                  </div>
                </div>
                <Button size="sm" onClick={() => handleJoin(c)} disabled={joining === c.id}>
                  {joining === c.id ? '…' : 'Relever'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
