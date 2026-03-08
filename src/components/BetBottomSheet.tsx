import { useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { calculatePariMutuelOdds, calculateEstimatedNetGain, maxBetAmount, DEFAULT_ODDS } from '@/lib/pari-mutuel';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import type { BetWithOptions } from '@/components/BetCard';

interface BetBottomSheetProps {
  bet: BetWithOptions;
  pools: Record<string, number>;
  totalPool: number;
  profileBalance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlaceWager: (betId: string, optionId: string, amount: number) => Promise<void>;
  existingWagerOptionId?: string | null;
}

export default function BetBottomSheet({
  bet, pools, totalPool, profileBalance, open, onOpenChange, onPlaceWager, existingWagerOptionId,
}: BetBottomSheetProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [placing, setPlacing] = useState(false);

  const isLongTerm = bet.is_long_terme;
  const max = maxBetAmount(profileBalance, isLongTerm);

  const selectedOption = bet.bet_options.find(o => o.id === selectedOptionId);

  const liveOdds = useMemo(() => {
    if (!selectedOptionId) return DEFAULT_ODDS;
    const optPool = pools[selectedOptionId] || 0;
    return totalPool > 0 && optPool > 0 ? calculatePariMutuelOdds(totalPool, optPool) : DEFAULT_ODDS;
  }, [selectedOptionId, pools, totalPool]);

  const numAmount = parseInt(amount) || 0;
  const estimatedNet = numAmount > 0 ? calculateEstimatedNetGain(numAmount, liveOdds) : 0;
  const profit = estimatedNet - numAmount;
  const canPlace = numAmount > 0 && numAmount <= max && numAmount <= profileBalance && !!selectedOptionId;
  const overBalance = numAmount > profileBalance;

  const handlePlace = async () => {
    if (!canPlace || !selectedOptionId) return;
    setPlacing(true);
    await onPlaceWager(bet.id, selectedOptionId, numAmount);
    setPlacing(false);
    setSelectedOptionId(null);
    setAmount('');
    onOpenChange(false);
  };

  const quickAmounts = [10, 50];

  const content = (
    <div className="px-1 pb-6 space-y-4">
      {/* Step 1: Option selection */}
      {!selectedOptionId ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground text-center mb-3">Choisis ton option :</p>
          {bet.bet_options.map(opt => {
            const optPool = pools[opt.id] || 0;
            const odds = totalPool > 0 && optPool > 0 ? calculatePariMutuelOdds(totalPool, optPool) : DEFAULT_ODDS;
            return (
              <button
                key={opt.id}
                onClick={() => setSelectedOptionId(opt.id)}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary/60 border border-border hover:border-primary/50 transition-colors"
              >
                <span className="font-semibold text-foreground">{opt.label}</span>
                <span className="text-primary font-bold bg-primary/10 px-3 py-1 rounded-lg text-sm">
                  x{odds.toFixed(2)}
                  <span className="block text-[10px] text-muted-foreground font-normal">Cote estimée</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        /* Step 2: Amount input */
        <div className="space-y-4">
          <button
            onClick={() => { setSelectedOptionId(null); setAmount(''); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Changer d'option
          </button>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">Tu mises sur</p>
            <p className="font-display text-xl tracking-[0.05em] text-primary">{selectedOption?.label}</p>
            <p className="text-xs text-muted-foreground mt-1">Cote estimée : <span className="text-primary font-bold">x{liveOdds.toFixed(2)}</span></p>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Combien tu mises ? (DC)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={max}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="text-center text-lg h-12"
              />
              <img src={daimcoinLogo} alt="" className="w-5 h-5 rounded-full" />
            </div>
            <div className="flex gap-2 mt-2">
              {quickAmounts.map(q => (
                <button
                  key={q}
                  onClick={() => setAmount(String(Math.min(q, max)))}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  {q} DC
                </button>
              ))}
              <button
                onClick={() => setAmount(String(max))}
                className="flex-1 text-xs py-1.5 rounded-lg bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-colors"
              >
                MAX
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Maximum : {isLongTerm ? '15%' : '30%'} de ton solde = <span className="text-primary font-semibold">{max} DC</span>
            </p>
          </div>

          {/* Recap */}
          {numAmount > 0 && (
            <div className="bg-secondary/50 border border-border rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gain estimé (après rake de 5%)</span>
                <span className="text-primary font-bold">{estimatedNet} DC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profit potentiel estimé</span>
                <span className={profit > 0 ? 'text-green-500 font-bold' : 'text-muted-foreground'}>
                  {profit > 0 ? '+' : ''}{profit} DC
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Montants provisoires — les cotes évoluent avec les mises des autres.
              </p>
            </div>
          )}

          {overBalance && (
            <p className="text-xs text-destructive text-center">
              Solde insuffisant (solde actuel : {profileBalance} DC).
            </p>
          )}

          <Button
            className="w-full gold-gradient text-base font-semibold h-12"
            disabled={!canPlace || placing}
            onClick={handlePlace}
          >
            {placing ? 'Placement...' : 'Placer ma mise 🦌'}
          </Button>

          <button
            onClick={() => { onOpenChange(false); navigate(`/bet/${bet.id}`); }}
            className="block text-center w-full text-xs text-primary hover:underline"
          >
            Voir les détails →
          </button>
        </div>
      )}
    </div>
  );

  const title = `${bet.emoji || '🎲'} ${bet.title}`;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle className="font-display tracking-[0.05em]">{title}</DrawerTitle>
            <DrawerDescription className="text-xs">Solde : {profileBalance} DC</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 overflow-y-auto">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display tracking-[0.05em]">{title}</SheetTitle>
          <SheetDescription className="text-xs">Solde : {profileBalance} DC</SheetDescription>
        </SheetHeader>
        <div className="mt-4">{content}</div>
      </SheetContent>
    </Sheet>
  );
}
