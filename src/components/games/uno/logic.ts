import type { UnoCard, UnoColor } from './types';
export type { UnoPublicState, UnoColor, UnoCard } from './types';
export { UNO_COLOR_CLASS, UNO_COLOR_LABEL, cardLabel } from './types';

export function canPlayClient(
  card: UnoCard,
  top: UnoCard,
  currentColor: UnoColor,
  pending: { type: 'plus2' | 'plus4'; amount: number } | null,
): boolean {
  if (pending) {
    if (pending.type === 'plus2') return card.value === 'plus2';
    if (pending.type === 'plus4') return card.value === 'wild4';
    return false;
  }
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  if (top.color !== 'wild' && card.value === top.value) return true;
  return false;
}