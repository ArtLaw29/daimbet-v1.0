import { useCasinoSuspended, CasinoSuspendedScreen } from '@/hooks/useCasinoSuspended';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Swords, KeyRound } from 'lucide-react';
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

const CHESS_MODES = [
  { id: 'blitz', label: 'Blitz · 5 min' },
  { id: 'normal', label: 'Normal · 15 min' },
  { id: 'infini', label: 'Infini · 24h/coup' },
];

export default function DuelsPage() {
  const __casino = useCasinoSuspended('duels');
  if (__casino.suspended) return <CasinoSuspendedScreen label="Duels" />;
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