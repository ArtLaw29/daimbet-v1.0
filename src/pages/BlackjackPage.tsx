import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Coins } from 'lucide-react';

type Suit = '♠️' | '♥️' | '♦️' | '♣️';
type Card = { rank: string; suit: Suit; value: number; label: string };
type Phase = 'mise' | 'joueur' | 'croupier' | 'fin';
type Outcome = 'gagne' | 'perdu' | 'egalite' | 'blackjack' | null;

const SUITS: Suit[] = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = [
  { r: '2', v: 2, fr: '2' }, { r: '3', v: 3, fr: '3' }, { r: '4', v: 4, fr: '4' },
  { r: '5', v: 5, fr: '5' }, { r: '6', v: 6, fr: '6' }, { r: '7', v: 7, fr: '7' },
  { r: '8', v: 8, fr: '8' }, { r: '9', v: 9, fr: '9' }, { r: '10', v: 10, fr: '10' },
  { r: 'J', v: 10, fr: 'Valet' }, { r: 'Q', v: 10, fr: 'Dame' },
  { r: 'K', v: 10, fr: 'Roi' }, { r: 'A', v: 11, fr: 'As' },
];
const SUIT_FR: Record<Suit, string> = { '♠️': 'Pique', '♥️': 'Cœur', '♦️': 'Carreau', '♣️': 'Trèfle' };

function drawCard(): Card {
  const r = RANKS[Math.floor(Math.random() * RANKS.length)];
  const s = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank: r.r, suit: s, value: r.v, label: `${r.fr} de ${SUIT_FR[s]} ${s} — ${r.v} points` };
}

function handTotal(cards: Card[]): number {
  let total = cards.reduce((a, c) => a + c.value, 0);
  let aces = cards.filter(c => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

export default function BlackjackPage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [mise, setMise] = useState<number>(50);
  const [phase, setPhase] = useState<Phase>('mise');
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);

  const balance = profile?.balance ?? 0;
  const playerTotal = handTotal(player);
  const dealerTotal = handTotal(dealer);

  const updateBalance = async (delta: number, reason: string) => {
    if (!user || delta === 0) return;
    const { error } = await supabase
      .from('profiles')
      .update({ balance: balance + delta })
      .eq('user_id', user.id);
    if (error) { toast.error('Erreur de solde'); return; }
    await supabase.from('solde_history').insert({ user_id: user.id, delta_dc: delta, reason });
    await refreshProfile();
  };

  const startGame = async () => {
    if (!user) return;
    if (mise < 10) { toast.error('Mise minimum : 10 DC'); return; }
    if (mise > balance) { toast.error('Pas assez de DAIMcoins !'); return; }
    setBusy(true);
    // Debit
    const { error } = await supabase
      .from('profiles').update({ balance: balance - mise }).eq('user_id', user.id);
    if (error) { toast.error('Erreur'); setBusy(false); return; }
    await supabase.from('solde_history').insert({ user_id: user.id, delta_dc: -mise, reason: 'Mise Blackjack' });
    await refreshProfile();
    const p = [drawCard(), drawCard()];
    const d = [drawCard()];
    setPlayer(p); setDealer(d); setOutcome(null);
    if (handTotal(p) === 21) {
      // Blackjack immédiat → 2.5x
      const win = Math.floor(mise * 2.5);
      setPhase('fin'); setOutcome('blackjack');
      await new Promise(r => setTimeout(r, 300));
      // Refund + payout (already debited mise)
      await supabase.from('profiles').update({ balance: balance - mise + win }).eq('user_id', user.id);
      await supabase.from('solde_history').insert({ user_id: user.id, delta_dc: win, reason: 'Gain Blackjack (BJ naturel)' });
      await refreshProfile();
    } else {
      setPhase('joueur');
    }
    setBusy(false);
  };

  const hit = () => {
    if (phase !== 'joueur') return;
    const next = [...player, drawCard()];
    setPlayer(next);
    if (handTotal(next) > 21) {
      setPhase('fin'); setOutcome('perdu');
    }
  };

  const stand = async () => {
    if (phase !== 'joueur') return;
    setPhase('croupier');
    let d = [...dealer];
    while (handTotal(d) < 17) {
      d = [...d, drawCard()];
      setDealer([...d]);
      await new Promise(r => setTimeout(r, 600));
    }
    const dt = handTotal(d);
    const pt = handTotal(player);
    let result: Outcome;
    let payout = 0;
    if (dt > 21 || pt > dt) { result = 'gagne'; payout = mise * 2; }
    else if (pt === dt) { result = 'egalite'; payout = mise; }
    else { result = 'perdu'; payout = 0; }
    setOutcome(result);
    setPhase('fin');
    if (payout > 0) {
      await updateBalance(payout, `Blackjack: ${result === 'gagne' ? 'gain' : 'égalité'}`);
    }
  };

  const replay = () => {
    setPlayer([]); setDealer([]); setOutcome(null); setPhase('mise');
  };

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-2xl">
      <button onClick={() => navigate('/jeux')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Retour aux jeux
      </button>
      <div className="text-center mb-6">
        <h1 className="text-4xl font-display gold-text">🃏 Blackjack</h1>
        <p className="text-sm text-muted-foreground mt-1">Bats le croupier sans dépasser 21</p>
        <div className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full bg-card border border-primary/30">
          <Coins className="w-4 h-4 text-primary" />
          <span className="font-semibold">{balance} DC</span>
        </div>
      </div>

      {phase === 'mise' && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-display">Place ta mise</h2>
          <div className="flex gap-2">
            <Input type="number" min={10} max={balance} value={mise}
              onChange={(e) => setMise(Math.max(0, parseInt(e.target.value) || 0))} />
            <Button onClick={() => setMise(Math.min(balance, mise + 10))} variant="outline">+10</Button>
            <Button onClick={() => setMise(Math.min(balance, mise + 50))} variant="outline">+50</Button>
          </div>
          <p className="text-xs text-muted-foreground">Min 10 DC. Blackjack naturel (21 sur 2 cartes) paie x2.5.</p>
          <Button onClick={startGame} disabled={busy || mise < 10 || mise > balance} className="w-full" size="lg">
            Distribuer les cartes
          </Button>
        </Card>
      )}

      {phase !== 'mise' && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-display text-xl">Croupier</h3>
              <span className="text-sm font-semibold">
                {phase === 'joueur' ? '?' : dealerTotal} pts
              </span>
            </div>
            <div className="space-y-2">
              {dealer.map((c, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="px-3 py-2 rounded-md bg-secondary text-sm">
                  {phase === 'joueur' && i > 0 ? '🂠 Carte cachée' : c.label}
                </motion.div>
              ))}
            </div>
          </Card>

          <Card className="p-5 border-primary/30">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-display text-xl gold-text">Toi</h3>
              <span className={`text-sm font-semibold ${playerTotal > 21 ? 'text-destructive' : ''}`}>
                {playerTotal} pts
              </span>
            </div>
            <div className="space-y-2">
              {player.map((c, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="px-3 py-2 rounded-md bg-secondary text-sm">
                  {c.label}
                </motion.div>
              ))}
            </div>
          </Card>

          {phase === 'joueur' && (
            <div className="flex gap-3">
              <Button onClick={hit} className="flex-1" size="lg">Tirer une carte</Button>
              <Button onClick={stand} variant="outline" className="flex-1" size="lg">Stop</Button>
            </div>
          )}

          <AnimatePresence>
            {phase === 'fin' && outcome && (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="text-center p-6 rounded-xl border-2"
                style={{
                  borderColor: outcome === 'perdu' ? 'hsl(var(--destructive))' :
                    outcome === 'egalite' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))',
                  background: outcome === 'perdu' ? 'hsl(var(--destructive) / 0.1)' :
                    outcome === 'egalite' ? 'hsl(var(--muted) / 0.3)' : 'hsl(var(--primary) / 0.1)',
                }}>
                <p className="text-5xl mb-2">
                  {outcome === 'blackjack' ? '🎰' : outcome === 'gagne' ? '🏆' : outcome === 'egalite' ? '🤝' : '💸'}
                </p>
                <h2 className="text-2xl font-display">
                  {outcome === 'blackjack' ? `BLACKJACK ! +${Math.floor(mise * 2.5)} DC` :
                   outcome === 'gagne' ? `Tu gagnes +${mise * 2} DC !` :
                   outcome === 'egalite' ? `Égalité — mise remboursée` :
                   playerTotal > 21 ? `Tu dépasses 21 ! -${mise} DC` : `Le croupier gagne — -${mise} DC`}
                </h2>
                <Button onClick={replay} className="mt-4" size="lg">Rejouer</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
