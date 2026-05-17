import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Coins, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useDailyLimit } from '@/hooks/useDailyLimit';

type BetType = 'straight' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'dozen' | 'column';
interface Bet { type: BetType; numbers?: number[]; amount: number; label: string }

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const COLUMNS = [
  Array.from({ length: 12 }, (_, i) => 1 + i * 3),  // 1,4,7,...
  Array.from({ length: 12 }, (_, i) => 2 + i * 3),
  Array.from({ length: 12 }, (_, i) => 3 + i * 3),
];

const CHIP_VALUES = [5, 10, 25, 50, 100];

export default function RoulettePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { config } = useGameConfig<{ betMin: number; betMax: number; maxPlaysPerDay: number }>('roulette');
  const { playsToday, maxPlays, canPlay } = useDailyLimit('roulette');
  const balance = profile?.balance ?? 0;

  const betMin = Math.max(5, config?.betMin ?? 5);
  const betMax = config?.betMax ?? 200;

  const [chip, setChip] = useState<number>(5);
  const [bets, setBets] = useState<Bet[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ number: number; color: string; net: number } | null>(null);

  const totalBet = useMemo(() => bets.reduce((s, b) => s + b.amount, 0), [bets]);

  const addBet = (b: Omit<Bet, 'amount'>) => {
    if (totalBet + chip > balance) { toast.error('Solde insuffisant'); return; }
    if (totalBet + chip > betMax) { toast.error(`Mise totale max : ${betMax} DC`); return; }
    setResult(null);
    setBets(prev => {
      const idx = prev.findIndex(p => p.type === b.type && JSON.stringify(p.numbers) === JSON.stringify(b.numbers));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], amount: next[idx].amount + chip };
        return next;
      }
      return [...prev, { ...b, amount: chip }];
    });
  };

  const clearBets = () => { setBets([]); setResult(null); };

  const spin = async () => {
    if (!user) return;
    if (totalBet < betMin) { toast.error(`Mise totale min : ${betMin} DC`); return; }
    if (!canPlay) { toast.error('Limite quotidienne atteinte'); return; }
    setSpinning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('roulette-spin', {
        body: { bets: bets.map(({ label, ...rest }) => rest) },
      });
      if (error) { toast.error(error.message); return; }
      const res = data as any;
      if (res?.error) { toast.error(res.error); return; }
      // Mini delay for drama
      await new Promise(r => setTimeout(r, 2000));
      setResult({ number: res.number, color: res.color, net: res.net });
      if (res.net > 0) toast.success(`+${res.net} DC !`);
      else if (res.net === 0) toast('Récupère ta mise');
      else toast.error(`-${Math.abs(res.net)} DC`);
      await refreshProfile();
      setBets([]);
    } finally {
      setSpinning(false);
    }
  };

  const numberCell = (n: number) => {
    const isRed = RED_NUMBERS.has(n);
    const isWin = result?.number === n;
    const bg = n === 0 ? 'bg-green-700' : isRed ? 'bg-red-700' : 'bg-zinc-900';
    const placed = bets.find(b => b.type === 'straight' && b.numbers?.[0] === n);
    return (
      <button key={n} onClick={() => addBet({ type: 'straight', numbers: [n], label: String(n) })}
        disabled={spinning}
        className={`relative h-10 ${bg} text-white border border-white/10 hover:brightness-125 transition ${isWin ? 'ring-4 ring-amber-400' : ''}`}>
        {n}
        {placed && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 text-black text-[10px] font-bold flex items-center justify-center">{placed.amount}</span>}
      </button>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl pb-24">
      <div className="text-center mb-4">
        <h1 className="text-4xl font-display gold-text">🎡 Roulette</h1>
        <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-card border border-primary/30">
          <Coins className="w-4 h-4 text-primary" /> {balance} DC
        </div>
        {maxPlays > 0 && (
          <p className="text-xs text-muted-foreground mt-1">Parties aujourd'hui : {playsToday}/{maxPlays}</p>
        )}
      </div>

      {result && (
        <Card className="p-4 mb-4 text-center">
          <p className="text-sm text-muted-foreground">Sortie</p>
          <p className={`text-5xl font-display ${
            result.color === 'g' ? 'text-green-500' : result.color === 'r' ? 'text-red-500' : 'text-zinc-300'
          }`}>{result.number}</p>
          <p className={`text-lg font-semibold mt-1 ${result.net > 0 ? 'text-primary' : result.net < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {result.net > 0 ? `+${result.net} DC` : result.net === 0 ? 'Égalité' : `${result.net} DC`}
          </p>
        </Card>
      )}

      {/* Tapis : 0 + 12 colonnes × 3 lignes */}
      <div className="bg-green-900/40 p-3 rounded-xl border border-green-700/30 mb-4">
        <div className="grid grid-cols-[40px_repeat(12,1fr)] gap-1">
          <button onClick={() => addBet({ type: 'straight', numbers: [0], label: '0' })} disabled={spinning}
            className="row-span-3 bg-green-700 text-white border border-white/10 hover:brightness-125">0</button>
          {[3, 2, 1].flatMap(row =>
            Array.from({ length: 12 }, (_, i) => row + i * 3)
          ).map(numberCell)}
        </div>
        {/* Outside bets */}
        <div className="grid grid-cols-3 gap-1 mt-1">
          {[[1, 12], [13, 24], [25, 36]].map(([s, e]) => (
            <button key={s} onClick={() => addBet({ type: 'dozen', numbers: [s, e], label: `${s}-${e}` })}
              disabled={spinning}
              className="h-8 bg-green-800/60 text-white text-xs border border-white/10 hover:brightness-125">
              {s}–{e}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1 mt-1">
          <button disabled={spinning} onClick={() => addBet({ type: 'low', label: '1-18' })}
            className="h-8 bg-green-800/60 text-white text-xs border border-white/10 hover:brightness-125">Manque (1-18)</button>
          <button disabled={spinning} onClick={() => addBet({ type: 'even', label: 'Pair' })}
            className="h-8 bg-green-800/60 text-white text-xs border border-white/10 hover:brightness-125">Pair</button>
          <button disabled={spinning} onClick={() => addBet({ type: 'red', label: 'Rouge' })}
            className="h-8 bg-red-700 text-white text-xs border border-white/10 hover:brightness-125">Rouge</button>
          <button disabled={spinning} onClick={() => addBet({ type: 'black', label: 'Noir' })}
            className="h-8 bg-zinc-900 text-white text-xs border border-white/10 hover:brightness-125">Noir</button>
          <button disabled={spinning} onClick={() => addBet({ type: 'odd', label: 'Impair' })}
            className="h-8 bg-green-800/60 text-white text-xs border border-white/10 hover:brightness-125">Impair</button>
          <button disabled={spinning} onClick={() => addBet({ type: 'high', label: '19-36' })}
            className="h-8 bg-green-800/60 text-white text-xs border border-white/10 hover:brightness-125">Passe (19-36)</button>
        </div>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {COLUMNS.map((col, idx) => (
            <button key={idx} disabled={spinning}
              onClick={() => addBet({ type: 'column', numbers: col, label: `Col ${idx + 1}` })}
              className="h-8 bg-green-800/60 text-white text-xs border border-white/10 hover:brightness-125">
              Colonne {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Chip selector */}
      <Card className="p-4 mb-4">
        <p className="text-xs text-muted-foreground mb-2">Valeur du jeton à poser</p>
        <div className="flex gap-2 flex-wrap">
          {CHIP_VALUES.map(v => (
            <Button key={v} variant={chip === v ? 'default' : 'outline'} size="sm" onClick={() => setChip(v)}>
              {v} DC
            </Button>
          ))}
        </div>
      </Card>

      {/* Bets list */}
      {bets.length > 0 && (
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Tes mises (total {totalBet} DC)</p>
            <Button variant="ghost" size="sm" onClick={clearBets} disabled={spinning}>Tout retirer</Button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {bets.map((b, i) => (
              <span key={i} className="px-2 py-1 rounded bg-secondary">{b.label} : {b.amount} DC</span>
            ))}
          </div>
        </Card>
      )}

      <Button onClick={spin} className="w-full" size="lg"
        disabled={spinning || bets.length === 0 || totalBet < betMin || totalBet > balance || !canPlay}>
        {spinning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Lancement…</> : `Lancer (${totalBet} DC)`}
      </Button>
      {!canPlay && maxPlays > 0 && (
        <p className="text-center text-xs text-destructive mt-2">Tu as atteint la limite du jour ({maxPlays}).</p>
      )}
      <p className="text-center text-[11px] text-muted-foreground mt-3 italic">
        Mise min {betMin} DC · max {betMax} DC · Plein 35:1 · Couleurs/Pair/Manque 1:1 · Douzaines/Colonnes 2:1
      </p>
    </div>
  );
}