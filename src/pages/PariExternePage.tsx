import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Coins, Swords, Trophy, AlertTriangle, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type Bet = {
  id: string;
  player1_id: string;
  player2_id: string | null;
  mise: number;
  status: string;
  result_player1: string | null;
  result_player2: string | null;
  created_at: string;
  motif: string | null;
};

type Profile = { user_id: string; display_name: string; emoji: string | null };

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  en_attente: { label: '⏳ En attente', color: 'text-warning' },
  accepte: { label: '🎲 En cours', color: 'text-primary' },
  refuse: { label: '🚫 Refusé', color: 'text-muted-foreground' },
  termine: { label: '✅ Terminé', color: 'text-success' },
  litige: { label: '⚠️ Litige', color: 'text-destructive' },
};

const RESULT_LABELS: Record<string, string> = {
  gagne: "J'ai gagné",
  perdu: "J'ai perdu",
  egalite: 'Égalité',
};

export default function PariExternePage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [bets, setBets] = useState<Bet[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [users, setUsers] = useState<Profile[]>([]);
  const [opponentId, setOpponentId] = useState('__none__');
  const [mise, setMise] = useState<number>(50);
  const [motif, setMotif] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: betData } = await supabase
      .from('external_bets')
      .select('*')
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .order('created_at', { ascending: false });
    const rows = (betData || []) as Bet[];
    setBets(rows);

    const ids = Array.from(new Set(rows.flatMap((b) => [b.player1_id, b.player2_id]).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles_public' as any)
        .select('user_id, display_name, emoji')
        .in('user_id', ids);
      const map: Record<string, Profile> = {};
      (profs || []).forEach((p: any) => (map[p.user_id] = p));
      setProfiles(map);
    }

    const { data: allUsers } = await supabase
      .from('profiles_public' as any)
      .select('user_id, display_name, emoji')
      .neq('user_id', user.id)
      .order('display_name');
    setUsers(((allUsers as any) || []) as Profile[]);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const createBet = async () => {
    if (opponentId === '__none__') return toast.error('Choisis un adversaire');
    if (!mise || mise < 1) return toast.error('Mise minimum : 1 DC');
    const motifTrim = motif.trim();
    if (!motifTrim) return toast.error('Motif obligatoire (ex : « Match de tennis demain »)');
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_external_bet', {
      p_opponent_id: opponentId,
      p_mise: Math.floor(mise),
      p_motif: motifTrim,
    } as any);
    setSubmitting(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error || error?.message || 'Erreur');
    toast.success('Défi envoyé ! 🤝');
    setOpponentId('__none__');
    setMise(50);
    setMotif('');
    await refreshProfile();
    await load();
  };

  const respond = async (bet: Bet, accept: boolean) => {
    const { data, error } = await supabase.rpc('respond_external_bet', { p_bet_id: bet.id, p_accept: accept });
    if (error || (data as any)?.error) return toast.error((data as any)?.error || error?.message || 'Erreur');
    toast.success(accept ? 'Pari accepté !' : 'Pari refusé');
    await refreshProfile();
    await load();
  };

  const declareResult = async (bet: Bet, result: string) => {
    const { data, error } = await supabase.rpc('declare_external_result', { p_bet_id: bet.id, p_result: result });
    if (error || (data as any)?.error) return toast.error((data as any)?.error || error?.message || 'Erreur');
    const out = (data as any)?.outcome;
    if (out === 'gagnant') {
      const won = (data as any).winner === user?.id;
      toast.success(won ? `🏆 Victoire ! +${bet.mise * 2} DC` : 'Pari clôturé');
    } else if (out === 'egalite') toast.info(`Égalité — mises remboursées (+${bet.mise} DC)`);
    else if (out === 'litige') toast.warning('⚠️ Litige : résultats divergents, un admin va trancher.');
    else toast.success('Résultat enregistré, en attente de l\'adversaire');
    await refreshProfile();
    await load();
  };

  const nameOf = (id: string | null) => {
    if (!id) return '?';
    const p = profiles[id];
    return p ? `${p.emoji || '🦌'} ${p.display_name}` : '?';
  };

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-2xl">
      <button onClick={() => navigate('/jeux')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Retour aux jeux
      </button>
      <div className="text-center mb-6">
        <h1 className="text-4xl font-display gold-text">🤝 Pari externe</h1>
        <p className="text-sm text-muted-foreground mt-1">Défie un autre Daim sur n'importe quoi (réel)</p>
      </div>

      {/* Create */}
      <Card className="p-5 mb-6 border-primary/30">
        <h2 className="font-display text-xl mb-3 flex items-center gap-2"><Swords className="w-5 h-5 text-primary" /> Lancer un défi</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Adversaire</label>
            <Select value={opponentId} onValueChange={setOpponentId}>
              <SelectTrigger><SelectValue placeholder="Choisis un Daim" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>Choisis un Daim</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.emoji || '🦌'} {u.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Mise (DC)</label>
            <Input type="number" min={1} value={mise} onChange={(e) => setMise(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Motif du pari *</label>
            <Input
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex : Match de tennis demain, partie de billard ce soir…"
              maxLength={140}
            />
          </div>
          <Button onClick={createBet} disabled={submitting} className="w-full">
            <Coins className="w-4 h-4 mr-2" /> Envoyer le défi
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Ta mise sera débitée immédiatement et conservée jusqu'à l'issue du pari.
          </p>
        </div>
      </Card>

      {/* Bets list */}
      <h2 className="font-display text-xl mb-3 flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> Mes paris</h2>
      {loading ? (
        <p className="text-center text-muted-foreground py-8">Chargement…</p>
      ) : bets.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">Aucun pari pour l'instant.</Card>
      ) : (
        <div className="space-y-3">
          {bets.map((bet) => {
            const isP1 = bet.player1_id === user?.id;
            const myResult = isP1 ? bet.result_player1 : bet.result_player2;
            const oppId = isP1 ? bet.player2_id : bet.player1_id;
            const status = STATUS_LABELS[bet.status] || { label: bet.status, color: '' };
            return (
              <Card key={bet.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold">
                      {isP1 ? 'Toi' : nameOf(bet.player1_id)} <span className="text-muted-foreground">vs</span> {isP1 ? nameOf(bet.player2_id) : 'Toi'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mise : <span className="text-primary font-bold">{bet.mise} DC</span> chacun · {new Date(bet.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold ${status.color}`}>{status.label}</span>
                </div>
                {bet.motif && (
                  <p className="text-xs text-foreground bg-secondary/50 rounded px-2 py-1.5 mb-2 italic">
                    « {bet.motif} »
                  </p>
                )}

                {/* J2 invite */}
                {bet.status === 'en_attente' && !isP1 && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => respond(bet, true)} className="flex-1"><Check className="w-4 h-4 mr-1" /> Accepter</Button>
                    <Button size="sm" variant="outline" onClick={() => respond(bet, false)} className="flex-1"><X className="w-4 h-4 mr-1" /> Refuser</Button>
                  </div>
                )}
                {bet.status === 'en_attente' && isP1 && (
                  <p className="text-xs text-muted-foreground mt-2">En attente de la réponse de {nameOf(oppId)}…</p>
                )}

                {/* Declare result */}
                {bet.status === 'accepte' && !myResult && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2">Quel est le résultat ?</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button size="sm" variant="outline" onClick={() => declareResult(bet, 'gagne')}>🏆 Gagné</Button>
                      <Button size="sm" variant="outline" onClick={() => declareResult(bet, 'perdu')}>💀 Perdu</Button>
                      <Button size="sm" variant="outline" onClick={() => declareResult(bet, 'egalite')}>🤝 Égalité</Button>
                    </div>
                  </div>
                )}
                {bet.status === 'accepte' && myResult && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Tu as déclaré : <b>{RESULT_LABELS[myResult]}</b>. En attente de {nameOf(oppId)}…
                  </p>
                )}

                {/* Litige */}
                {bet.status === 'litige' && (
                  <div className="mt-3 p-2 rounded bg-destructive/10 border border-destructive/30 text-xs flex gap-2 items-start">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      Résultats divergents : {nameOf(bet.player1_id)} → <b>{RESULT_LABELS[bet.result_player1 || ''] || '?'}</b>,
                      {' '}{nameOf(bet.player2_id)} → <b>{RESULT_LABELS[bet.result_player2 || ''] || '?'}</b>. Un admin va trancher.
                    </div>
                  </div>
                )}

                {/* Termine */}
                {bet.status === 'termine' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Résultats : {nameOf(bet.player1_id)} → {RESULT_LABELS[bet.result_player1 || ''] || '?'} · {nameOf(bet.player2_id)} → {RESULT_LABELS[bet.result_player2 || ''] || '?'}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}