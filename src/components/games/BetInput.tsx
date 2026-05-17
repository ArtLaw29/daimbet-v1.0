import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  balance: number;
  onBet?: () => void;
  betLabel?: string;
  disabled?: boolean;
  quickSteps?: number[];
}

export default function BetInput({
  value, onChange, min, max, balance,
  onBet, betLabel = 'Miser', disabled, quickSteps = [5, 10],
}: Props) {
  const effectiveMax = Math.min(max, balance);
  const tooLow = value < min;
  const tooHigh = value > max;
  const noFunds = value > balance;
  const invalid = tooLow || tooHigh || noFunds || !Number.isFinite(value);

  const setVal = (n: number) => onChange(Math.max(0, Math.floor(n)));

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <Input
          type="number"
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => setVal(parseInt(e.target.value) || 0)}
          className="w-32"
        />
        {quickSteps.map(s => (
          <Button
            key={s}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVal(Math.min(effectiveMax, value + s))}
          >
            +{s}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setVal(effectiveMax)}
        >
          Max
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Mise min : {min} DC · max : {max} DC · solde : {balance} DC
      </p>
      {tooLow && <p className="text-xs text-destructive">Mise minimum {min} DC</p>}
      {tooHigh && !tooLow && <p className="text-xs text-destructive">Mise maximum {max} DC</p>}
      {noFunds && !tooHigh && !tooLow && <p className="text-xs text-destructive">Solde insuffisant</p>}
      {onBet && (
        <Button onClick={onBet} disabled={disabled || invalid} className="w-full" size="lg">
          {betLabel}
        </Button>
      )}
    </div>
  );
}