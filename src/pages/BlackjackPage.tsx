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
type HandStatus = 'playing' | 'stand' | 'bust' | 'blackjack' | 'doubled' | 'surrender';
type HandResult = 'gagne' | 'perdu' | 'egalite' | 'blackjack' | 'surrender';
type Hand = { cards: CardT[]; bet: number; status: HandStatus };

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
  const [hands, setHands] = useState<Hand[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [dealer, setDealer] = useState<CardT[]>([]);
  const [revealedDealer, setRevealedDealer] = useState(1);
  const [results, setResults] = useState<HandResult[]>([]);
  const [totalPayout, setTotalPayout] = useState<number>(0);
  const [netGain, setNetGain] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [replayLockUntil, setReplayLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const baselineBalance = useRef(0);
  const totalDebited = useRef(0);

  const balance = profile?.balance ?? 0;
  const dealerVisible = dealer.slice(0, revealedDealer);
  const dealerInfo = handDetail(dealerVisible);

  useEffect(() => {
    if (phase !== 'fin') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);
  const replayWait = Math.max(0, Math.ceil((replayLockUntil - now) / 1000));

  // ───────── Solde / mise (Supabase) ─────────
  const debit = async (amount: number, reason: string) => {
    if (!user) return false;
    const newBal = baselineBalance.current - totalDebited.current - amount;
    const { error } = await supabase.from('profiles').update({ balance: newBal }).eq('user_id', user.id);
    if (error) { toast.error('Erreur de débit'); return false; }
    await supabase.from('solde_history').insert({ user_id: user.id, delta_dc: -amount, reason });
    totalDebited.current += amount;
    await refreshProfile();
    return true;
  };

  // ───────── Démarrage ─────────
  const startGame = async () => {
    if (!user) return;
    if (mise < 10) { toast.error('Mise minimum : 10 DC'); return; }
    if (mise > 300) { toast.error('La mise maximale est de 300 DC'); return; }
    if (mise > balance) { toast.error('Pas assez de DAIMcoins !'); return; }
    setBusy(true);
    baselineBalance.current = balance;
    totalDebited.current = 0;
    const ok = await debit(mise, 'Mise Blackjack');
    if (!ok) { setBusy(false); return; }

    setHands([]); setDealer([]); setRevealedDealer(1); setResults([]); setActiveIdx(0); setTotalPayout(0); setNetGain(0);
    setPhase('shuffle');
    await sleep(1800);

    const p1 = drawCard();
    setHands([{ cards: [p1], bet: mise, status: 'playing' }]);
    await sleep(1400);
    const d1 = drawCard();
    setDealer([d1]);
    await sleep(1400);
    const p2 = drawCard();
    const initial: Hand[] = [{ cards: [p1, p2], bet: mise, status: 'playing' }];
    setHands(initial);
    await sleep(1400);

    setBusy(false);

    // Pré-tirage de la carte cachée du croupier (peek pour détecter un BJ naturel)
    const d2 = drawCard();
    const dealerCards = [d1, d2];
    setDealer(dealerCards); // revealedDealer reste à 1 → carte cachée
    const playerBJ = handDetail([p1, p2]).total === 21;
    const dealerBJ = handDetail(dealerCards).total === 21;

    if (playerBJ || dealerBJ) {
      const status: HandStatus = playerBJ ? 'blackjack' : 'stand';
      const finalHand: Hand[] = [{ ...initial[0], status }];
      setHands(finalHand);
      await resolveDealerAndFinish(finalHand);
    } else {
      setPhase('joueur');
      setActiveIdx(0);
    }
  };

  // ───────── Actions joueur ─────────
  const updateHand = (idx: number, patch: Partial<Hand>) => {
    setHands(prev => prev.map((h, i) => i === idx ? { ...h, ...patch } : h));
  };

  const advanceOrDealer = async (updated: Hand[]) => {
    const nextIdx = updated.findIndex((h, i) => i > activeIdx && h.status === 'playing');
    if (nextIdx >= 0) {
      // Si la prochaine main n'a qu'une carte (post-split), compléter
      if (updated[nextIdx].cards.length === 1) {
        await sleep(800);
        const completed = [...updated];
        completed[nextIdx] = { ...completed[nextIdx], cards: [...completed[nextIdx].cards, drawCard()] };
        setHands(completed);
        await sleep(1200);
        // Vérifier blackjack post-split (compté comme 21 normal, pas BJ naturel)
        if (handDetail(completed[nextIdx].cards).total === 21) {
          completed[nextIdx] = { ...completed[nextIdx], status: 'stand' };
          setHands(completed);
          await advanceOrDealer(completed);
          return;
        }
      }
      setActiveIdx(nextIdx);
    } else {
      await resolveDealerAndFinish(updated);
    }
  };

  const hit = async () => {
    if (phase !== 'joueur' || drawing) return;
    setDrawing(true);
    await sleep(1400);
    const cur = hands[activeIdx];
    const newCards = [...cur.cards, drawCard()];
    const updated = hands.map((h, i) => i === activeIdx ? { ...h, cards: newCards } : h);
    setHands(updated);
    await sleep(1200);
    setDrawing(false);
    const total = handDetail(newCards).total;
    if (total > 21) {
      const busted = updated.map((h, i) => i === activeIdx ? { ...h, status: 'bust' as HandStatus } : h);
      setHands(busted);
      await advanceOrDealer(busted);
    } else if (total === 21) {
      const stood = updated.map((h, i) => i === activeIdx ? { ...h, status: 'stand' as HandStatus } : h);
      setHands(stood);
      await advanceOrDealer(stood);
    }
  };

  const stand = async () => {
    if (phase !== 'joueur' || drawing) return;
    const updated = hands.map((h, i) => i === activeIdx ? { ...h, status: 'stand' as HandStatus } : h);
    setHands(updated);
    await advanceOrDealer(updated);
  };

  const canDouble = () => {
    const h = hands[activeIdx];
    if (!h || h.status !== 'playing') return false;
    if (h.cards.length !== 2) return false;
    if (balance < h.bet) return false;
    return true;
  };

  const doubleDown = async () => {
    if (phase !== 'joueur' || drawing) return;
    if (!canDouble()) return;
    const cur = hands[activeIdx];
    setDrawing(true);
    const ok = await debit(cur.bet, 'Mise Blackjack (Double)');
    if (!ok) { setDrawing(false); return; }
    await sleep(1000);
    const newCards = [...cur.cards, drawCard()];
    const total = handDetail(newCards).total;
    const newStatus: HandStatus = total > 21 ? 'bust' : 'doubled';
    const updated = hands.map((h, i) => i === activeIdx ? { ...h, cards: newCards, bet: h.bet * 2, status: newStatus } : h);
    setHands(updated);
    await sleep(1200);
    setDrawing(false);
    await advanceOrDealer(updated);
  };

  const canSplit = () => {
    if (hands.length !== 1) return false; // un seul split autorisé
    const h = hands[activeIdx];
    if (!h || h.status !== 'playing') return false;
    if (h.cards.length !== 2) return false;
    if (h.cards[0].value !== h.cards[1].value) return false;
    if (balance < h.bet) return false;
    return true;
  };

  const split = async () => {
    if (phase !== 'joueur' || drawing) return;
    if (!canSplit()) return;
    const cur = hands[activeIdx];
    setDrawing(true);
    const ok = await debit(cur.bet, 'Mise Blackjack (Split)');
    if (!ok) { setDrawing(false); return; }
    // Créer 2 mains, distribuer une carte à la première immédiatement
    const handA: Hand = { cards: [cur.cards[0], drawCard()], bet: cur.bet, status: 'playing' };
    const handB: Hand = { cards: [cur.cards[1]], bet: cur.bet, status: 'playing' };
    setHands([handA, handB]);
    setActiveIdx(0);
    await sleep(1400);
    setDrawing(false);
    // Si la main A est déjà 21, stand auto et avancer
    if (handDetail(handA.cards).total === 21) {
      const updated: Hand[] = [{ ...handA, status: 'stand' }, handB];
      setHands(updated);
      await advanceOrDealer(updated);
    }
  };

  // ───────── Tour du croupier + résolution ─────────
  const resolveDealerAndFinish = async (finalHands: Hand[]) => {
    setPhase('croupier');
    // Si toutes les mains sont bust, pas besoin de tirer le croupier
    const allBust = finalHands.every(h => h.status === 'bust');
    let d = [...dealer];
    if (d.length < 2) {
      d = [...d, drawCard()];
      setDealer(d);
    }
    setRevealedDealer(d.length);
    await sleep(1500);

    if (!allBust) {
      while (true) {
        const info = handDetail(d);
        const mustHit = info.total < 17 || (info.total === 17 && info.soft);
        if (!mustHit) break;
        d = [...d, drawCard()];
        setDealer(d);
        setRevealedDealer(d.length);
        await sleep(1500);
      }
    }

    const dt = handDetail(d).total;
    const handResults: HandResult[] = [];
    let payout = 0;
    for (const h of finalHands) {
      const pt = handDetail(h.cards).total;
      if (h.status === 'blackjack') {
        // Blackjack naturel 6:5 → mise + profit floor(mise*6/5)
        payout += h.bet + Math.floor(h.bet * 6 / 5);
        handResults.push('blackjack');
      } else if (h.status === 'bust' || pt > 21) {
        handResults.push('perdu');
      } else if (dt > 21 || pt > dt) {
        payout += h.bet * 2;
        handResults.push('gagne');
      } else if (pt === dt) {
        payout += h.bet; // remboursement
        handResults.push('egalite');
      } else {
        handResults.push('perdu');
      }
    }
    setResults(handResults);
    await finalizeGame(payout);
  };

  const finalizeGame = async (payout: number) => {
    if (!user) return;
    // Calcul du gain net : payout - total débité
    const net = payout - totalDebited.current;
    let finalPayout = payout;
    if (net > 0) {
      const rake = Math.round(net * 0.05);
      finalPayout = payout - rake;
    }
    const finalNet = finalPayout - totalDebited.current;
    setTotalPayout(finalPayout);
    setNetGain(finalNet);
    if (finalPayout > 0) {
      const newBal = baselineBalance.current - totalDebited.current + finalPayout;
      await supabase.from('profiles').update({ balance: newBal }).eq('user_id', user.id);
      await supabase.from('solde_history').insert({
        user_id: user.id,
        delta_dc: finalPayout,
        reason: finalNet > 0 ? 'Gain Blackjack' : 'Égalité Blackjack — remboursement',
      });
      await refreshProfile();
    }
    setReplayLockUntil(Date.now() + 5000);
    setPhase('fin');
  };

  const replay = () => {
    if (replayWait > 0) return;
    setHands([]); setDealer([]); setRevealedDealer(1); setResults([]); setActiveIdx(0);
    setTotalPayout(0); setNetGain(0); totalDebited.current = 0;
    setPhase('mise');
  };

  // ───────── Rendu ─────────
  const activeHand = hands[activeIdx];

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
            <Input type="number" min={10} max={300} value={mise}
              onChange={(e) => setMise(Math.max(0, parseInt(e.target.value) || 0))} />
            <Button onClick={() => setMise(Math.min(300, balance, mise + 10))} variant="outline">+10</Button>
            <Button onClick={() => setMise(Math.min(300, balance, mise + 50))} variant="outline">+50</Button>
          </div>
          <p className="text-xs text-muted-foreground">Mise max : 300 DC</p>
          <p className="text-xs text-muted-foreground">
            Min 10 DC. Blackjack naturel paie 6:5. Victoire normale paie 1:1. Égalité = remboursement. Double et Split disponibles. Rake de 5% sur les gains nets.
          </p>
          <Button onClick={startGame} disabled={busy || mise < 10 || mise > 300 || mise > balance} className="w-full" size="lg">
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

          <div className={`grid gap-4 ${hands.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {hands.map((h, i) => {
              const info = handDetail(h.cards);
              const isActive = phase === 'joueur' && i === activeIdx;
              const result = phase === 'fin' ? results[i] : null;
              const borderClass = isActive
                ? 'border-primary ring-2 ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)]'
                : result === 'gagne' || result === 'blackjack'
                  ? 'border-primary/60'
                  : result === 'perdu'
                    ? 'border-destructive/60'
                    : 'border-border';
              return (
                <Card key={i} className={`p-5 transition-all ${borderClass}`}>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-display text-xl gold-text">
                      {hands.length > 1 ? `Main ${i + 1}` : 'Toi'}
                      {isActive && <span className="ml-2 text-xs text-primary">● en cours</span>}
                    </h3>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${info.total > 21 ? 'text-destructive' : ''}`}>
                        {scoreLabel(h.cards)} pts
                      </div>
                      <div className="text-[10px] text-muted-foreground">Mise: {h.bet} DC</div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap min-h-[7rem]">
                    <AnimatePresence>
                      {h.cards.map((c, j) => (
                        <PlayingCard key={`p-${i}-${j}`} card={c} />
                      ))}
                    </AnimatePresence>
                  </div>
                  {h.status === 'bust' && <p className="text-xs text-destructive mt-2 font-semibold">Bust !</p>}
                  {h.status === 'doubled' && <p className="text-xs text-primary mt-2 font-semibold">Doublé</p>}
                  {h.status === 'blackjack' && <p className="text-xs text-primary mt-2 font-semibold">Blackjack !</p>}
                  {result && (
                    <p className={`text-xs mt-2 font-semibold ${
                      result === 'gagne' || result === 'blackjack' ? 'text-primary' :
                      result === 'egalite' ? 'text-muted-foreground' : 'text-destructive'
                    }`}>
                      {result === 'blackjack' ? '🎰 Blackjack' :
                       result === 'gagne' ? '🏆 Gagnée' :
                       result === 'egalite' ? '🤝 Égalité' : '💸 Perdue'}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>

          {phase === 'joueur' && activeHand && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button onClick={hit} disabled={drawing} size="lg">
                  {drawing ? '…' : 'Tirer'}
                </Button>
                <Button onClick={stand} disabled={drawing} variant="outline" size="lg">Stop</Button>
                <Button onClick={doubleDown} disabled={drawing || !canDouble()} variant="secondary" size="lg">
                  Doubler
                </Button>
                <Button onClick={split} disabled={drawing || !canSplit()} variant="secondary" size="lg">
                  Séparer
                </Button>
              </div>
              {activeHand.cards.some(c => c.rank === 'A') && (
                <p className="text-[11px] text-muted-foreground">As : 1 ou 11 pts selon ton intérêt.</p>
              )}
            </>
          )}

          <AnimatePresence>
            {phase === 'fin' && (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="text-center p-6 rounded-xl border-2"
                style={{
                  borderColor: netGain > 0 ? 'hsl(var(--primary))' :
                    netGain === 0 ? 'hsl(var(--muted-foreground))' : 'hsl(var(--destructive))',
                  background: netGain > 0 ? 'hsl(var(--primary) / 0.1)' :
                    netGain === 0 ? 'hsl(var(--muted) / 0.3)' : 'hsl(var(--destructive) / 0.1)',
                }}>
                <p className="text-5xl mb-2">
                  {netGain > 0 ? '🏆' : netGain === 0 ? '🤝' : '💸'}
                </p>
                <h2 className="text-2xl font-display">
                  {netGain > 0 ? `Tu gagnes +${netGain} DC !` :
                   netGain === 0 ? 'Égalité — mise remboursée' :
                   `Tu perds ${netGain} DC`}
                </h2>
                {hands.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Total misé : {totalDebited.current} DC — Rendu : {totalPayout} DC
                  </p>
                )}
                <Button onClick={replay} disabled={replayWait > 0} className="mt-4" size="lg">
                  {replayWait > 0 ? `Rejouer (${replayWait}s)` : 'Rejouer'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground mt-8 italic">
        Règles de la maison : 6:5 Blackjack — Dealer hits Soft 17 — Double / Split autorisés — 5% Rake on wins — Sabot 8 jeux (CSM, remélange continu)
      </p>
    </div>
  );
}