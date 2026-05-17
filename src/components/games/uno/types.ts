export type UnoColor = 'r' | 'y' | 'g' | 'b'
export type UnoCardValue = number | 'skip' | 'reverse' | 'plus2' | 'wild' | 'wild4'
export interface UnoCard { id: string; color: UnoColor | 'wild'; value: UnoCardValue }

export interface UnoPublicState {
  players: string[]
  hand_counts: Record<string, number>
  your_hand: UnoCard[]
  discard_top: UnoCard | null
  current_color: UnoColor
  turn_index: number
  current_player: string
  direction: 1 | -1
  pending_draw: { type: 'plus2' | 'plus4'; amount: number } | null
  pending_color_choice: boolean
  uno_window: { uid: string; expires_at: number; resolved: null | 'uno' | 'counter'; resolver_id?: string } | null
  pot: number
  mise: number
  malus_enabled: boolean
  malus_amount: number
  finished: boolean
  winner_id?: string
  draw_pile_count: number
  log: string[]
}

export const UNO_COLOR_CLASS: Record<UnoColor | 'wild', string> = {
  r: 'bg-red-600 text-white border-red-800',
  y: 'bg-yellow-400 text-black border-yellow-600',
  g: 'bg-green-600 text-white border-green-800',
  b: 'bg-blue-600 text-white border-blue-800',
  wild: 'bg-gradient-to-br from-red-600 via-yellow-400 to-blue-600 text-white border-black',
}

export const UNO_COLOR_LABEL: Record<UnoColor, string> = {
  r: 'Rouge', y: 'Jaune', g: 'Vert', b: 'Bleu',
}

export function cardLabel(c: UnoCard): string {
  if (c.value === 'wild') return '🎨'
  if (c.value === 'wild4') return '+4'
  if (c.value === 'plus2') return '+2'
  if (c.value === 'skip') return '⊘'
  if (c.value === 'reverse') return '⇄'
  return String(c.value)
}