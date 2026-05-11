import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Coins } from 'lucide-react';

type Suit = '♠' | '♥' | '♦' | '♣';
type CardT = { rank: string; suit: Suit; value: number };
type Phase = 'mise' | 'shuffle' | 'joueur' | 'croupier' | 'fin';
type Outcome = 'gagne' | 'perdu' | 'egalite' | 'blackjack' | null;

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS = [
  { r: '2', v: 2 }, { r: '3', v: 3 }, { r: '4', v: 4 }, { r: '5', v: 5 },
  { r: '6', v: 6 }, { r: '7', v: 7 }, { r: '8', v: 8 }, { r: '9', v: 9 },
  { r: '10', v: 10 }, { r: 'J', v: 10 }, { r: 'Q', v: 10 }, { r: 'K', v: 10 }, { r: 'A', v: 11 },
];
const RED: Suit[] = ['♥', '♦'];

function drawCard(): CardT {
  const r = RANKS[Math.floor(Math.random() * RANKS.length)];
  const s = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank: r.r, suit: s, value: r.v };
}

// Returns {total, soft} where soft means there is an Ace counted as 11
function handDetail(cards: CardT[]) {
  const hard = cards.reduce((a, c) => a + (c.rank === 'A' ? 1 : c.value), 0);
  const hasAce = cards.some(c => c.rank === 'A');
  const soft = hasAce && hard + 10 <= 21;
  return { total: soft ? hard + 10 : hard, soft, hard };
}

function scoreLabel(cards: CardT[]): string {
  if (cards.length === 0) return '0';
  const { total, soft, hard } = handDetail(cards);
  if (soft && hard !== total) return `${hard} ou ${total}`;
  return `${total}`;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ───────── Composants visuels de carte ─────────
function PlayingCard({ card, hidden = false, delay = 0 }: { card?: CardT; hidden?: boolean; delay?: number }) {
  const isRed = card && RED.includes(card.suit);
  return (
    <motion.div
      initial={{ rotateY: 180, opacity: 0, y: -20 }}
      animate={{ rotateY: 0, opacity: 1, y: 0 }}
      transition={{ duration: 1, delay, type: 'spring', stiffness: 80 }}
      style={{ transformStyle: 'preserve-3d' }}
      className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg shadow-lg shrink-0"
    >
      {hidden || !card ? (
        <div className="w-full h-full rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-white/30 flex items-center justify-center">
          <div className="w-10 h-16 rounded border border-white/40 bg-blue-800/50 grid grid-cols-2 grid-rows-3 gap-0.5 p-0.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white/20 rounded-sm" />
            ))}
          </div>
        </div>
      ) : (
        <div className={`relative w-full h-full rounded-lg bg-white border border-gray-200 ${isRed ? 'text-red-600' : 'text-gray-900'} flex items-center justify-center font-bold select-none`}>
          <span className="absolute top-1 left-1.5 text-xs sm:text-sm leading-none flex flex-col items-center">
            <span>{card.rank}</span>
            <span>{card.suit}</span>
          </span>
          <span className="absolute bottom-1 right-1.5 text-xs sm:text-sm leading-none flex flex-col items-center rotate-180">
            <span>{card.rank}</span>
            <span>{card.suit}</span>
          </span>
          <span className="text-3xl sm:text-4xl">{card.suit}</span>
        </div>
      )}
    </motion.div>
  );
}

function CardBack({ idx }: { idx: number }) {
  return (
    <motion.div
      className="absolute w-16 h-24 sm:w-20 sm:h-28 rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-white/30 shadow-xl"
      initial={{ x: 0, y: 0, rotate: 0 }}
      animate={{
        x: [0, idx * 12 - 30, idx * -8 + 20, 0],
        y: [0, -10, 10, 0],
        rotate: [0, 15 - idx * 5, -15 + idx * 4, 0],
      }}
      transition={{ duration: 1.5, ease: 'easeInOut' }}
    >
      <div className="w-full h-full rounded-lg flex items-center justify-center">
        <div className="w-10 h-16 rounded border border-white/40 bg-blue-800/50 grid grid-cols-2 grid-rows-3 gap-0.5 p-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white/20 rounded-sm" />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ShuffleAnimation() {
  return (
    <div className="relative h-32 flex items-center justify-center my-6">
      {[0, 1, 2, 3, 4].map(i => <CardBack key={i} idx={i} />)}
    </div>
  );
}

// ───────── Page ─────────
export default function BlackjackPage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [mise, setMise] = useState<number>(50);
  const [phase, setPhase] = useState<Phase>('mise');
  const [player, setPlayer] = useState<CardT[]>([]);
  const [dealer, setDealer] = useState<CardT[]>([]);
  const [revealedDealer, setRevealedDealer] = useState(1); // nombre de cartes croupier visibles
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [replayLockUntil, setReplayLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const baselineBalance = useRef(0);

  const balance = profile?.balance ?? 0;
  const playerInfo = handDetail(player);
  const dealerVisible = dealer.slice(0, revealedDealer);
  const dealerInfo = handDetail(dealerVisible);

  // Tick for replay countdown
  useEffect(() => {
    if (phase !== 'fin') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);
  const replayWait = Math.max(0, Math.ceil((replayLockUntil - now) / 1000));

  const finishGame = async (result: Outcome, payout: number) => {
    setOutcome(result);
    setPhase('fin');
    setReplayLockUntil(Date.now() + 5000);
    if (payout > 0 && user) {
      // Apply 5% rake on net winnings only (not on returned stake / push)
      let finalPayout = payout;
      const netGain = payout - mise;
      if (netGain > 0) {
        const rake = Math.round(netGain * 0.05);
        finalPayout = payout - rake;
      }
      const newBal = baselineBalance.current - mise + finalPayout;
      await supabase.from('profiles').update({ balance: newBal }).eq('user_id', user.id);
      const reasonMap: Record<string, string> = {
        blackjack: 'Gain Blackjack (BJ naturel)',
        gagne: 'Gain Blackjack',
        egalite: 'Égalité Blackjack — remboursement',
      };
      await supabase.from('solde_history').insert({ user_id: user.id, delta_dc: finalPayout, reason: reasonMap[result || 'gagne'] });
      await refreshProfile();
    }
  };

  const startGame = async () => {
    if (!user) return;
    if (mise < 10) { toast.error('Mise minimum : 10 DC'); return; }
    if (mise > balance) { toast.error('Pas assez de DAIMcoins !'); return; }
    setBusy(true);
    baselineBalance.current = balance;
    // Débit
    const { error } = await supabase.from('profiles').update({ balance: balance - mise }).eq('user_id', user.id);
    if (error) { toast.error('Erreur'); setBusy(false); return; }
    await supabase.from('solde_history').insert({ user_id: user.id, delta_dc: -mise, reason: 'Mise Blackjack' });
    await refreshProfile();

    setPlayer([]); setDealer([]); setRevealedDealer(1); setOutcome(null);
    setPhase('shuffle');
    await sleep(1800);

    // Distribution une carte à la fois (1s entre chaque)
    const p1 = drawCard();
    setPlayer([p1]);
    await sleep(1400);
    const d1 = drawCard();
    setDealer([d1]);
    await sleep(1400);
    const p2 = drawCard();
    const fullPlayer = [p1, p2];
    setPlayer(fullPlayer);
    await sleep(1400);

    setBusy(false);

    if (handDetail(fullPlayer).total === 21) {
      // Blackjack naturel 6:5 → profit = mise * 6/5, payout = mise + profit
      const payout = mise + Math.floor(mise * 6 / 5);
      await finishGame('blackjack', payout);
    } else {
      setPhase('joueur');
    }
  };

  const hit = async () => {
    if (phase !== 'joueur' || drawing) return;
    setDrawing(true);
    await sleep(1400);
    const next = [...player, drawCard()];
    setPlayer(next);
    await sleep(1400);
    setDrawing(false);
    if (handDetail(next).total > 21) {
      // Bust
      await finishGame('perdu', 0);
    }
  };

  const stand = async () => {
    if (phase !== 'joueur') return;
    setPhase('croupier');
    // Reveal hidden dealer card (déjà dealer[1] si présent, sinon en tirera)
    let d = [...dealer];
    if (d.length < 2) {
      d = [...d, drawCard()];
      setDealer(d);
    }
    setRevealedDealer(d.length);
    await sleep(1500);

    // Dealer hits soft 17 (H17)
    while (true) {
      const info = handDetail(d);
      const mustHit = info.total < 17 || (info.total === 17 && info.soft);
      if (!mustHit) break;
      d = [...d, drawCard()];
      setDealer(d);
      setRevealedDealer(d.length);
      await sleep(1500);
    }

    const dt = handDetail(d).total;
    const pt = handDetail(player).total;
    let result: Outcome;
    let payout = 0;
    if (dt > 21 || pt > dt) { result = 'gagne'; payout = mise * 2; }     // mise + gain x1
    else if (pt === dt) { result = 'egalite'; payout = mise; }            // remboursement
    else { result = 'perdu'; payout = 0; }
    await finishGame(result, payout);
  };

  const replay = () => {
    if (replayWait > 0) return;
    setPlayer([]); setDealer([]); setRevealedDealer(1); setOutcome(null); setPhase('mise');
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
          <p className="text-xs text-muted-foreground">
            Min 10 DC. Blackjack naturel paie x1.5. Victoire normale paie x1. Égalité = remboursement. Aucun rake.
          </p>
          <Button onClick={startGame} disabled={busy || mise < 10 || mise > balance} className="w-full" size="lg">
            {busy ? 'Mélange…' : 'Distribuer les cartes'}
          </Button>
        </Card>
      )}

      {phase === 'shuffle' && (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">Le croupier mélange les cartes…</p>
          <ShuffleAnimation />
        </Card>
      )}

      {phase !== 'mise' && phase !== 'shuffle' && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-display text-xl">Croupier</h3>
              <span className="text-sm font-semibold">
                {phase === 'joueur'
                  ? `${dealerInfo.total === 11 && dealerInfo.soft ? '1 ou 11' : scoreLabel(dealerVisible)} + ?`
                  : `${scoreLabel(dealerVisible)} pts`}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap min-h-[7rem]">
              <AnimatePresence>
                {dealer.map((c, i) => (
                  <PlayingCard key={`d-${i}`} card={c} hidden={phase === 'joueur' && i >= revealedDealer} />
                ))}
                {phase === 'joueur' && dealer.length === 1 && (
                  <PlayingCard key="d-hidden" hidden delay={0} />
                )}
              </AnimatePresence>
            </div>
          </Card>

          <Card className="p-5 border-primary/30">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-display text-xl gold-text">Toi</h3>
              <span className={`text-sm font-semibold ${playerInfo.total > 21 ? 'text-destructive' : ''}`}>
                {scoreLabel(player)} pts
              </span>
            </div>
            <div className="flex gap-2 flex-wrap min-h-[7rem]">
              <AnimatePresence>
                {player.map((c, i) => (
                  <PlayingCard key={`p-${i}`} card={c} />
                ))}
              </AnimatePresence>
            </div>
            {player.some(c => c.rank === 'A') && phase === 'joueur' && (
              <p className="text-[11px] text-muted-foreground mt-2">As : 1 ou 11 pts selon ton intérêt.</p>
            )}
          </Card>

          {phase === 'joueur' && (
            <div className="flex gap-3">
              <Button onClick={hit} disabled={drawing} className="flex-1" size="lg">
                {drawing ? 'Tirage…' : 'Tirer une carte'}
              </Button>
              <Button onClick={stand} disabled={drawing} variant="outline" className="flex-1" size="lg">Stop</Button>
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
                  {outcome === 'blackjack' ? `BLACKJACK ! +${Math.floor(Math.floor(mise * 6 / 5) * 0.95)} DC` :
                   outcome === 'gagne' ? `Tu gagnes +${Math.floor(mise * 0.95)} DC !` :
                   outcome === 'egalite' ? `Égalité — mise remboursée` :
                   playerInfo.total > 21 ? `Tu dépasses 21 ! -${mise} DC` : `Le croupier gagne — -${mise} DC`}
                </h2>
                <Button onClick={replay} disabled={replayWait > 0} className="mt-4" size="lg">
                  {replayWait > 0 ? `Rejouer (${replayWait}s)` : 'Rejouer'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground mt-8 italic">
        Règles de la maison : 6:5 Blackjack — Dealer hits Soft 17 — 5% Rake on wins — Sabot 8 jeux (CSM, remélange continu)
      </p>
    </div>
  );
}
