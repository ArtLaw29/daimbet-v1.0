import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Flame, Clock, CheckCircle, XCircle, TrendingUp, PauseCircle, Timer, Users } from 'lucide-react';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { calculatePariMutuelOdds, maxBetAmount, calculateEstimatedNetGain, DEFAULT_ODDS } from '@/lib/pari-mutuel';
import type { Tables } from '@/integrations/supabase/types';
import { useCountdown } from '@/hooks/useCountdown';

type BetOption = Tables<'bet_options'>;
type BetRow = Tables<'bets'>;

export interface BetWithOptions extends BetRow {
  bet_options: BetOption[];
}

export interface UserWager {
  bet_id: string;
  option_id: string;
  montant_dc: number;
  option_label?: string;
}

interface BetCardProps {
  bet: BetWithOptions;
  pools: Record<string, number>;
  totalPool: number;
  profileBalance: number;
  userWager?: UserWager | null;
  wagerCount?: number;
  onOpenBet: (bet: BetWithOptions) => void;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; cardClass?: string }> = {
  ouvert: { icon: Flame, label: 'Mises ouvertes 🔥', color: 'text-primary' },
  cloture_en_attente: { icon: Clock, label: '⏳ En attente de résolution', color: 'text-muted-foreground', cardClass: 'opacity-80' },
  suspendu: { icon: PauseCircle, label: '⏸️ Suspendu par Jordaim Belfort', color: 'text-amber-500', cardClass: 'border-amber-500/50 bg-amber-500/5' },
  resolu: { icon: CheckCircle, label: 'Résolu ✅', color: 'text-green-500' },
  supprime: { icon: XCircle, label: 'Supprimé', color: 'text-destructive' },
};

const CATEGORY_BADGES: Record<string, { label: string; class: string }> = {
  urgent: { label: '⚡ URGENT', class: 'text-destructive bg-destructive/10' },
  long_terme: { label: '📅 LONG TERME', class: 'text-accent bg-accent/10' },
  culture_daim: { label: '🎪 CULTURE DAIM', class: 'text-primary bg-primary/10' },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return format(new Date(dateStr), "d MMM yyyy · HH'h'mm", { locale: fr });
}

export default function BetCard({ bet, pools, totalPool, profileBalance, userWager, wagerCount = 0, onOpenBet }: BetCardProps) {
  const status = STATUS_CONFIG[bet.status] || STATUS_CONFIG.ouvert;
  const StatusIcon = status.icon;
  const isLongTerm = bet.is_long_terme;
  const isOpen = bet.status === 'ouvert';
  const isSuspended = bet.status === 'suspendu';
  const isClosed = bet.status === 'cloture_en_attente';
  const isTierce = bet.type === 'tierce_du_daim';

  const closeDate = bet.close_date ? new Date(bet.close_date) : null;
  const countdown = useCountdown(isOpen && closeDate ? closeDate : null);

  const categoryBadge = CATEGORY_BADGES[bet.category];
  // For long terme with couple/love keywords, override badge
  const displayBadge = isLongTerm && (bet.title.toLowerCase().includes('couple') || bet.title.toLowerCase().includes('amour'))
    ? { label: '💕 LONG TERME', class: 'text-accent bg-accent/10' }
    : categoryBadge;

  // For Tiercé, show top 3 by pool volume, rest collapsed
  const sortedOptions = isTierce
    ? [...bet.bet_options].sort((a, b) => (pools[b.id] || 0) - (pools[a.id] || 0))
    : bet.bet_options;
  const visibleOptions = isTierce ? sortedOptions.slice(0, 3) : sortedOptions;
  const hiddenCount = isTierce ? Math.max(0, sortedOptions.length - 3) : 0;

  return (
    <div className={`rounded-xl border border-border bg-card p-5 card-glow ${status.cardClass || ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-display tracking-[0.05em]">
            {bet.emoji || '🎲'} {bet.title}
          </h2>
          {bet.description && (
            <p className="text-sm text-muted-foreground mt-1">{bet.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {displayBadge && (
              <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${displayBadge.class}`}>
                {displayBadge.label}
              </span>
            )}
            {isLongTerm && (
              <span className="inline-flex items-center text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                Mise max 15%
              </span>
            )}
          </div>
        </div>
        <span className={`flex items-center gap-1 text-xs font-medium whitespace-nowrap ${status.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {status.label}
        </span>
      </div>

      {/* Suspended banner */}
      {isSuspended && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-3 text-center">
          <p className="text-sm text-amber-500 font-medium">⏸️ Ce pari est suspendu — aucune interaction possible</p>
        </div>
      )}

      {/* Closed banner */}
      {isClosed && (
        <div className="bg-secondary/50 border border-border rounded-lg p-3 mb-3 text-center">
          <p className="text-sm text-muted-foreground">Mises closes — résultat à venir</p>
        </div>
      )}

      {/* Countdown */}
      {isOpen && countdown && countdown.isUrgent && (
        <div className="flex items-center gap-2 mb-3 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
          <Timer className="w-4 h-4 text-destructive animate-pulse" />
          <span className="text-sm font-semibold text-destructive">
            Fin des mises dans {countdown.text}
          </span>
        </div>
      )}

      {/* Dates */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
        <span>📅 Fin du pari : <span className="text-foreground">{formatDate(bet.end_date)}</span></span>
        <span>🔒 Mises closes à : <span className="text-foreground">{formatDate(bet.close_date)}</span></span>
      </div>

      {/* Pool info + wager count */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
        {totalPool > 0 && (
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            Cagnotte : <span className="text-primary font-bold">{totalPool}</span>
            <img src={daimcoinLogo} alt="" className="w-3.5 h-3.5 rounded-full" />
          </span>
        )}
        {wagerCount > 0 && (
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {wagerCount} parieur{wagerCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Options */}
      <div className="space-y-2">
        {visibleOptions.map((option) => {
          const optionPool = pools[option.id] || 0;
          const liveOdds = totalPool > 0 && optionPool > 0 ? calculatePariMutuelOdds(totalPool, optionPool) : DEFAULT_ODDS;
          const percentage = totalPool > 0 ? ((optionPool / totalPool) * 100).toFixed(0) : '0';
          const currentBetAmount = betAmounts[option.id] || 10;
          const estimatedNet = calculateEstimatedNetGain(currentBetAmount, liveOdds);

          return (
            <div key={option.id} className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
              <div className="flex-1 min-w-[120px]">
                <span className="font-medium">{option.label}</span>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {optionPool > 0 ? (
                    <>{percentage}% des mises · {optionPool} DC</>
                  ) : (
                    <>Aucune mise pour l'instant</>
                  )}
                </div>
                {isOpen && (
                  <div className="text-xs text-primary/80 mt-0.5">
                    Gain estimé (après rake 5%) : {estimatedNet} DC
                  </div>
                )}
              </div>
              <div className="text-center">
                <span className="text-primary font-bold text-sm px-2 py-1 rounded bg-primary/10 block">
                  x{liveOdds.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {isClosed ? 'Cote définitive' : 'Cote estimée'}
                </span>
              </div>
              {isOpen && !isSuspended && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={maxBetAmount(profileBalance, isLongTerm)}
                    value={betAmounts[option.id] || 10}
                    onChange={(e) => onAmountChange(option.id, parseInt(e.target.value) || 0)}
                    className="w-20 h-8 text-center text-sm"
                  />
                  <img src={daimcoinLogo} alt="" className="w-4 h-4 rounded-full" />
                  <Button
                    size="sm"
                    className="gold-gradient text-xs font-semibold"
                    onClick={() => onPlaceWager(bet.id, option.id)}
                  >
                    Parier
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tiercé: show hidden options count */}
      {isTierce && hiddenCount > 0 && (
        <p className="text-xs text-primary mt-2 text-center cursor-pointer hover:underline">
          + {hiddenCount} autres options →
        </p>
      )}

      {/* Personal wager indicator */}
      {userWager && (
        <div className="mt-3 pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            🦌 Tu as misé <span className="text-primary font-semibold">{userWager.montant_dc} DC</span> sur <span className="font-medium">{userWager.option_label || 'une option'}</span>
          </p>
        </div>
      )}
    </div>
  );
}
