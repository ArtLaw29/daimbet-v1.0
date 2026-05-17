interface Props { amount: number; small?: boolean; }

/** Visual breakdown of a DC stack into colored chips. */
const DENOMS: { v: number; cls: string }[] = [
  { v: 100, cls: 'bg-zinc-900 border-zinc-700 text-zinc-100' },
  { v: 25,  cls: 'bg-emerald-600 border-emerald-300 text-white' },
  { v: 10,  cls: 'bg-rose-600 border-rose-300 text-white' },
  { v: 5,   cls: 'bg-sky-600 border-sky-300 text-white' },
  { v: 1,   cls: 'bg-zinc-400 border-zinc-200 text-zinc-900' },
];

export default function ChipStack({ amount, small }: Props) {
  if (amount <= 0) return null;
  let rem = amount;
  const piles: { v: number; cls: string; count: number }[] = [];
  for (const d of DENOMS) {
    const c = Math.floor(rem / d.v);
    if (c > 0) { piles.push({ ...d, count: c }); rem -= c * d.v; }
  }
  const size = small ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <div
      className="flex items-end gap-0.5"
      title="1 jeton noir = 100 DC · vert = 25 · rouge = 10 · bleu = 5 · gris = 1"
    >
      {piles.map((p, i) => (
        <div key={i} className="flex flex-col-reverse items-center">
          {Array.from({ length: Math.min(p.count, 4) }).map((_, j) => (
            <div key={j} className={`${size} rounded-full border ${p.cls} -mt-1 first:mt-0 shadow`} />
          ))}
          {p.count > 4 && <span className="text-[8px] text-muted-foreground">×{p.count}</span>}
        </div>
      ))}
    </div>
  );
}