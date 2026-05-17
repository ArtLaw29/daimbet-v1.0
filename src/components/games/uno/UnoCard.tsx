import { UnoCard as UnoCardT, UNO_COLOR_CLASS, cardLabel } from './types';

interface Props {
  card: UnoCardT;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  className?: string;
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'w-10 h-14 text-base',
  md: 'w-14 h-20 text-xl',
  lg: 'w-20 h-28 text-3xl',
};

export default function UnoCard({ card, onClick, disabled, highlight, size = 'md', faceDown, className }: Props) {
  if (faceDown) {
    return (
      <div
        className={`${SIZE[size]} rounded-md border-2 border-black bg-gradient-to-br from-amber-900 to-amber-700 flex items-center justify-center font-display text-white shadow-md ${className ?? ''}`}
      >
        UNO
      </div>
    );
  }
  const colorClass = UNO_COLOR_CLASS[card.color];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${SIZE[size]} rounded-md border-2 ${colorClass} flex items-center justify-center font-bold shadow-md transition-transform
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-2 cursor-pointer'}
        ${highlight ? 'ring-2 ring-amber-400 ring-offset-1' : ''}
        ${className ?? ''}`}
      title={cardLabel(card)}
    >
      <span className="drop-shadow-sm">{cardLabel(card)}</span>
    </button>
  );
}