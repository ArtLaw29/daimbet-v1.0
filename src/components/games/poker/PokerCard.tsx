interface Props { card?: string | null; hidden?: boolean; highlight?: boolean; small?: boolean; }

const SUIT_INFO: Record<string, { sym: string; color: string }> = {
  s: { sym: '♠', color: 'text-zinc-900 dark:text-zinc-100' },
  c: { sym: '♣', color: 'text-zinc-900 dark:text-zinc-100' },
  h: { sym: '♥', color: 'text-red-600' },
  d: { sym: '♦', color: 'text-red-600' },
};
const RANK_DISPLAY: Record<string, string> = { T: '10' };

export default function PokerCard({ card, hidden, highlight, small }: Props) {
  const size = small ? 'w-9 h-12 text-sm' : 'w-12 h-16 sm:w-14 sm:h-20 text-lg sm:text-xl';
  if (hidden || !card) {
    return (
      <div className={`${size} rounded-md bg-gradient-to-br from-rose-700 to-rose-900 border border-rose-300/30 shadow-md flex items-center justify-center`}>
        <span className="text-rose-200 text-lg">🦌</span>
      </div>
    );
  }
  const rank = card[0];
  const suit = SUIT_INFO[card[1]];
  const display = RANK_DISPLAY[rank] || rank;
  return (
    <div className={`${size} rounded-md bg-white border-2 ${highlight ? 'border-amber-400 ring-2 ring-amber-300 shadow-lg' : 'border-zinc-300'} shadow flex flex-col items-center justify-center font-bold ${suit.color} transition-all`}>
      <span className="leading-none">{display}</span>
      <span className="leading-none">{suit.sym}</span>
    </div>
  );
}