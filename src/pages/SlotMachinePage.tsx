import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Coins, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import BetInput from '@/components/games/BetInput';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useDailyLimit } from '@/hooks/useDailyLimit';
import { useCooldown } from '@/hooks/useCooldown';

const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
const REEL_HEIGHT = 80; // px per cell

// Generates a long reel sequence ending on the target symbol for visual scroll.
function buildReel(target: string, length = 30) {
  const arr = Array.from({ length }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  arr[arr.length - 1] = target;
  return arr;
}

function Reel({ target, spinning, delay }: { target: string; spinning: boolean; delay: number }) {
  const [reel, setReel] = useState<string[]>(() => Array.from({ length: 30 }, (_, i) => SYMBOLS[i % SYMBOLS.length]));
  const [translate, setTranslate] = useState(0);

  useEffect(() => {
    if (spinning) {
      const next = buildReel(target);
      setReel(next);
      setTranslate(0);
      requestAnimationFrame(() => {
        setTranslate(-(next.length - 1) * REEL_HEIGHT);
      });
    }
  }, [spinning, target]);

  return (
    <div className="overflow-hidden border-2 border-amber-400/60 rounded-lg bg-zinc-950" style={{ height: REEL_HEIGHT, width: REEL_HEIGHT }}>
      <div
        style={{
          transform: `translateY(${translate}px)`,
          transition: spinning ? `transform ${3 + delay}s cubic-bezier(0.15, 0.85, 0.25, 1)` : 'none',
        }}
      >
        {reel.map((s, i) => (
          <div key={i} style={{ height: REEL_HEIGHT }} className="flex items-center justify-center text-5xl">{s}</div>
        ))}
      </div>
    </div>
  );
}

export default function SlotMachinePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { config } = useGameConfig<{ betMin: number; betMax: number; cooldownSec: number; maxSpinsPerDay: number }>('slot_machine');
  const { playsToday, maxPlays, canPlay: canDaily } = useDailyLimit('slot_machine', 'maxSpinsPerDay');
  const cooldownSec = Math.max(0, config?.cooldownSec ?? 30);
  const { secondsLeft, canPlay: cdOk, trigger } = useCooldown('slot_machine', cooldownSec);

  const balance = profile?.balance ?? 0;
  const betMin = config?.betMin ?? 5;
  const betMax = config?.betMax ?? 100;

  const [bet, setBet] = useState<number>(betMin);
  const [spinning, setSpinning] = useState(false);
  const [targets, setTargets] = useState<[string, string, string]>(['🍒', '🍋', '🔔']);
  const [stoppedCount, setStoppedCount] = useState(3);
  const [result, setResult] = useState<{ net: number; multiplier: number } | null>(null);

  useEffect(() => { if (bet < betMin) setBet(betMin); }, [betMin, bet]);

  const spin = async () => {
    if (!user) return;
    if (!canDaily) { toast.error('Limite quotidienne atteinte'); return; }
    if (!cdOk) { toast.error(`Cooldown ${secondsLeft}s`); return; }

    setSpinning(true);
    setResult(null);
    setStoppedCount(0);

    try {
      const { data, error } = await supabase.functions.invoke('slot-spin', { body: { bet } });
      if (error) { toast.error(error.message); setSpinning(false); return; }
      const res = data as any;
      if (res?.error) { toast.error(res.error); setSpinning(false); return; }

      trigger();
      const r = res.reels as [string, string, string];
      setTargets(r);
      // Sequential reel stops: 3s, 4s, 5s
      setTimeout(() => setStoppedCount(1), 3000);
      setTimeout(() => setStoppedCount(2), 4000);
      setTimeout(() => {
        setStoppedCount(3);
        setSpinning(false);
        setResult({ net: res.net, multiplier: res.multiplier });
        if (res.net > 0) toast.success(`+${res.net} DC !`);
        else if (res.net === 0) toast('Paire — mise remboursée');
        else toast.error(`-${Math.abs(res.net)} DC`);
        refreshProfile();
      }, 5000);
    } catch (e) {
      toast.error((e as Error).message);
      setSpinning(false);
    }
  };

  const cooldownActive = !cdOk;

  return (
    <div className="container mx-auto px-4 py-6 max-w-md pb-24">
      <div className="text-center mb-4">
        <h1 className="text-4xl font-display gold-text">🎰 Machine à sous</h1>
        <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-card border border-primary/30">
          <Coins className="w-4 h-4 text-primary" /> {balance} DC
        </div>
        {maxPlays > 0 && (
          <p className="text-xs text-muted-foreground mt-1">Spins aujourd'hui : {playsToday}/{maxPlays}</p>
        )}
      </div>

      <Card className="p-6 mb-4 bg-gradient-to-br from-amber-950/40 to-zinc-950">
        <div className="flex justify-center gap-3 mb-3">
          <Reel target={targets[0]} spinning={spinning && stoppedCount < 1} delay={0} />
          <Reel target={targets[1]} spinning={spinning && stoppedCount < 2} delay={1} />
          <Reel target={targets[2]} spinning={spinning && stoppedCount < 3} delay={2} />
        </div>
        {result && (
          <p className={`text-center text-xl font-display ${result.net > 0 ? 'text-primary' : result.net < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {result.multiplier >= 2
              ? `🎉 Combo ×${result.multiplier} → +${result.net} DC`
              : result.multiplier === 1
                ? '🤝 Paire — mise remboursée'
                : `💸 ${result.net} DC`}
          </p>
        )}
      </Card>

      <Card className="p-4 mb-4">
        <BetInput
          value={bet}
          onChange={setBet}
          min={betMin}
          max={betMax}
          balance={balance}
          quickSteps={[5, 10]}
        />
      </Card>

      <Button onClick={spin} className="w-full" size="lg"
        disabled={spinning || !canDaily || cooldownActive || bet < betMin || bet > betMax || bet > balance}>
        {spinning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Spin…</>
          : cooldownActive ? `Patiente ${secondsLeft}s`
          : `Spin (${bet} DC)`}
      </Button>
      {!canDaily && maxPlays > 0 && (
        <p className="text-center text-xs text-destructive mt-2">Limite quotidienne atteinte ({maxPlays}).</p>
      )}
      <p className="text-center text-[11px] text-muted-foreground mt-3 italic">
        Triple 7 ×100 · Triple 💎 ×50 · Triple ⭐ ×25 · Triple 🔔 ×12 · Triple 🍋 ×8 · Triple 🍒 ×5 · Paire = remboursement
      </p>
    </div>
  );
}