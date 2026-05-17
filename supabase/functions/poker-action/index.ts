// Texas Hold'em — server-authoritative engine.
// All state (deck, hands, pot, side pots, turn) is stored in game_state_sessions.
// Clients only ever see a public view + their own private hand.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/* ===================== Card helpers ===================== */
const SUITS = ['s', 'h', 'd', 'c']
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const RANK_VAL: Record<string, number> = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]))

type Card = string // e.g. 'As', 'Th', '2c'

function buildDeck(): Card[] {
  const d: Card[] = []
  for (const r of RANKS) for (const s of SUITS) d.push(r + s)
  return d
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  const buf = new Uint32Array(a.length)
  crypto.getRandomValues(buf)
  for (let i = a.length - 1; i > 0; i--) {
    const j = buf[i] % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const rankOf = (c: Card) => RANK_VAL[c[0]]
const suitOf = (c: Card) => c[1]

/* ===================== 5-of-7 Evaluator ===================== */
// returns [cat, kicker1, kicker2, ...] (lexicographic comparison)
// cat: 9 SF, 8 Quads, 7 Full, 6 Flush, 5 Straight, 4 Trips, 3 2P, 2 Pair, 1 High
function eval5(cards: Card[]): { score: number[]; name: string; usedRanks: number[] } {
  const ranks = cards.map(rankOf).sort((a, b) => b - a)
  const suits = cards.map(suitOf)
  const isFlush = suits.every(s => s === suits[0])
  // straight detection (ranks desc, unique)
  const uniq = [...new Set(ranks)]
  let straightHigh = 0
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0]
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2)
      straightHigh = 5 // wheel
  }
  // count by rank
  const counts: Record<number, number> = {}
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ r: Number(r), c }))
    .sort((a, b) => b.c - a.c || b.r - a.r)

  if (isFlush && straightHigh) return { score: [9, straightHigh], name: 'Quinte flush', usedRanks: ranks }
  if (groups[0].c === 4) return { score: [8, groups[0].r, groups[1].r], name: 'Carré', usedRanks: ranks }
  if (groups[0].c === 3 && groups[1].c === 2) return { score: [7, groups[0].r, groups[1].r], name: 'Full', usedRanks: ranks }
  if (isFlush) return { score: [6, ...ranks], name: 'Couleur', usedRanks: ranks }
  if (straightHigh) return { score: [5, straightHigh], name: 'Quinte', usedRanks: ranks }
  if (groups[0].c === 3) return { score: [4, groups[0].r, groups[1].r, groups[2].r], name: 'Brelan', usedRanks: ranks }
  if (groups[0].c === 2 && groups[1].c === 2) return { score: [3, groups[0].r, groups[1].r, groups[2].r], name: 'Deux paires', usedRanks: ranks }
  if (groups[0].c === 2) return { score: [2, groups[0].r, groups[1].r, groups[2].r, groups[3].r], name: 'Paire', usedRanks: ranks }
  return { score: [1, ...ranks], name: 'Carte haute', usedRanks: ranks }
}

function bestOf7(cards: Card[]): { score: number[]; name: string; used: Card[] } {
  if (cards.length < 5) {
    const e = eval5([...cards, ...Array(5 - cards.length).fill('2s')])
    return { ...e, used: cards }
  }
  let best = { score: [0], name: '', used: [] as Card[] }
  const n = cards.length
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const hand = [cards[a], cards[b], cards[c], cards[d], cards[e]]
            const ev = eval5(hand)
            if (cmpScore(ev.score, best.score) > 0) best = { score: ev.score, name: ev.name, used: hand }
          }
  return best
}
function cmpScore(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

/* ===================== Game types ===================== */
type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
type PlayerStatus = 'active' | 'folded' | 'all_in' | 'sitting_out'

interface PlayerState {
  stack: number
  bet_this_round: number
  total_invested: number
  status: PlayerStatus
  has_acted: boolean
}
interface PokerState {
  round_number: number
  buy_in: number
  small_blind: number
  big_blind: number
  phase: Phase
  deck: Card[]
  hands: Record<string, Card[]>
  community: Card[]
  pot: number
  current_bet: number
  min_raise: number
  seat_order: string[] // immutable seating order
  dealer_index: number
  small_blind_index: number
  big_blind_index: number
  current_player_index: number
  player_states: Record<string, PlayerState>
  last_action: { userId: string; action: string; amount?: number } | null
  winners: { userId: string; amount: number; hand_name: string }[] | null
  log: string[]
}

/* ===================== Engine helpers ===================== */
function nextActiveIndex(s: PokerState, from: number): number {
  const n = s.seat_order.length
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n
    const ps = s.player_states[s.seat_order[idx]]
    if (ps && ps.status === 'active') return idx
  }
  return from
}
function activePlayers(s: PokerState): string[] {
  return s.seat_order.filter(id => s.player_states[id]?.status === 'active' || s.player_states[id]?.status === 'all_in')
}
function nonFoldedPlayers(s: PokerState): string[] {
  return s.seat_order.filter(id => s.player_states[id]?.status !== 'folded' && s.player_states[id]?.status !== 'sitting_out')
}
function activeOnlyPlayers(s: PokerState): string[] {
  return s.seat_order.filter(id => s.player_states[id]?.status === 'active')
}

function isBettingRoundOver(s: PokerState): boolean {
  const acts = activeOnlyPlayers(s)
  if (acts.length === 0) return true
  // all active players have acted AND matched current_bet
  return acts.every(id => {
    const ps = s.player_states[id]
    return ps.has_acted && ps.bet_this_round === s.current_bet
  })
}

function collectBetsIntoPot(s: PokerState) {
  for (const id of s.seat_order) {
    const ps = s.player_states[id]
    if (!ps) continue
    s.pot += ps.bet_this_round
    ps.bet_this_round = 0
    if (ps.status === 'active') ps.has_acted = false
  }
  s.current_bet = 0
  s.min_raise = s.big_blind
}

function dealCommunity(s: PokerState, n: number) {
  // burn one
  s.deck.shift()
  for (let i = 0; i < n; i++) s.community.push(s.deck.shift()!)
}

function advancePhase(s: PokerState) {
  collectBetsIntoPot(s)
  // first to act post-flop = first active player left of dealer
  const firstToAct = nextActiveIndex(s, s.dealer_index)
  if (s.phase === 'preflop') { s.phase = 'flop'; dealCommunity(s, 3) }
  else if (s.phase === 'flop') { s.phase = 'turn'; dealCommunity(s, 1) }
  else if (s.phase === 'turn') { s.phase = 'river'; dealCommunity(s, 1) }
  else if (s.phase === 'river') { s.phase = 'showdown'; return }
  s.current_player_index = firstToAct
  s.log.push(`Phase : ${s.phase}.`)
}

/* ===================== Side pots + showdown ===================== */
function computeSidePots(s: PokerState): { amount: number; eligible: string[] }[] {
  // Distribute s.pot — but we need per-player total contributions to build sidepots.
  // total_invested is the cumulative contribution this hand.
  const contributors = s.seat_order
    .filter(id => (s.player_states[id]?.total_invested ?? 0) > 0)
    .map(id => ({ id, inv: s.player_states[id].total_invested, folded: s.player_states[id].status === 'folded' }))
    .sort((a, b) => a.inv - b.inv)

  const pots: { amount: number; eligible: string[] }[] = []
  let prev = 0
  for (let i = 0; i < contributors.length; i++) {
    const level = contributors[i].inv
    if (level <= prev) continue
    const delta = level - prev
    const participants = contributors.slice(i)
    const amount = delta * participants.length
    const eligible = participants.filter(p => !p.folded).map(p => p.id)
    if (amount > 0 && eligible.length > 0) pots.push({ amount, eligible })
    prev = level
  }
  return pots
}

async function settleShowdown(admin: any, roomId: string, s: PokerState) {
  const remaining = nonFoldedPlayers(s)
  const winners: { userId: string; amount: number; hand_name: string }[] = []

  if (remaining.length === 1) {
    const winnerId = remaining[0]
    const total = s.pot
    await payout(admin, winnerId, total, roomId, s.round_number, 'pot_win')
    winners.push({ userId: winnerId, amount: total, hand_name: 'Seul restant' })
    s.player_states[winnerId].stack += total
    s.pot = 0
    s.winners = winners
    s.log.push(`Pot remporté par le dernier joueur restant (${total} DC).`)
    return
  }

  // Build side pots from contributions
  const pots = computeSidePots(s)
  // For each pot, find best hand among eligible
  const showdownHands: Record<string, ReturnType<typeof bestOf7>> = {}
  for (const id of remaining) {
    showdownHands[id] = bestOf7([...(s.hands[id] || []), ...s.community])
  }

  for (const pot of pots) {
    const eligible = pot.eligible.filter(id => remaining.includes(id))
    if (eligible.length === 0) continue
    let bestScore: number[] = [0]
    let bestIds: string[] = []
    for (const id of eligible) {
      const h = showdownHands[id]
      const c = cmpScore(h.score, bestScore)
      if (c > 0) { bestScore = h.score; bestIds = [id] }
      else if (c === 0) bestIds.push(id)
    }
    const share = Math.floor(pot.amount / bestIds.length)
    let leftover = pot.amount - share * bestIds.length
    for (const wid of bestIds) {
      const amt = share + (leftover > 0 ? 1 : 0)
      if (leftover > 0) leftover--
      await payout(admin, wid, amt, roomId, s.round_number, 'pot_win')
      s.player_states[wid].stack += amt
      const existing = winners.find(w => w.userId === wid)
      if (existing) existing.amount += amt
      else winners.push({ userId: wid, amount: amt, hand_name: showdownHands[wid].name })
    }
  }

  s.pot = 0
  s.winners = winners
  for (const w of winners) {
    s.log.push(`${w.hand_name} : ${w.amount} DC remportés.`)
  }
}

async function payout(admin: any, toId: string, amount: number, roomId: string, round: number, reason: string) {
  if (amount <= 0) return
  await admin.rpc('process_dc_transaction', {
    p_from: null, p_to: toId, p_amount: amount,
    p_reason: 'poker_' + reason, p_metadata: { game: 'poker', room_id: roomId, round, reason },
  })
}

/* ===================== Action handler ===================== */
function applyAction(s: PokerState, uid: string, action: string, amount?: number): string | null {
  if (s.phase === 'waiting' || s.phase === 'showdown') return 'Aucune action possible maintenant'
  if (s.seat_order[s.current_player_index] !== uid) return 'Ce n\'est pas votre tour'
  const ps = s.player_states[uid]
  if (!ps || ps.status !== 'active') return 'Vous n\'êtes pas en jeu'

  const toCall = s.current_bet - ps.bet_this_round

  if (action === 'fold') {
    ps.status = 'folded'
    ps.has_acted = true
    s.log.push(`${uid.slice(0, 6)} se couche.`)
  } else if (action === 'check') {
    if (toCall > 0) return 'Impossible de checker, il y a une mise à suivre'
    ps.has_acted = true
    s.log.push(`${uid.slice(0, 6)} check.`)
  } else if (action === 'call') {
    if (toCall <= 0) return 'Rien à suivre — utilisez check'
    const pay = Math.min(toCall, ps.stack)
    ps.stack -= pay
    ps.bet_this_round += pay
    ps.total_invested += pay
    if (ps.stack === 0) ps.status = 'all_in'
    ps.has_acted = true
    s.log.push(`${uid.slice(0, 6)} suit ${pay} DC.`)
  } else if (action === 'raise') {
    const target = Math.floor(Number(amount ?? 0))
    if (target <= s.current_bet) return 'Une relance doit être supérieure à la mise courante'
    const need = target - ps.bet_this_round
    if (need > ps.stack) return 'Solde insuffisant pour cette relance (utilisez All-in)'
    if (target - s.current_bet < s.min_raise && need < ps.stack) return `Relance minimale : ${s.current_bet + s.min_raise}`
    ps.stack -= need
    ps.bet_this_round += need
    ps.total_invested += need
    s.min_raise = target - s.current_bet
    s.current_bet = target
    // Reset has_acted for all other active players (must respond)
    for (const id of s.seat_order) {
      if (id !== uid && s.player_states[id]?.status === 'active') s.player_states[id].has_acted = false
    }
    ps.has_acted = true
    if (ps.stack === 0) ps.status = 'all_in'
    s.log.push(`${uid.slice(0, 6)} relance à ${target} DC.`)
  } else if (action === 'all_in') {
    const shove = ps.stack
    ps.bet_this_round += shove
    ps.total_invested += shove
    ps.stack = 0
    if (ps.bet_this_round > s.current_bet) {
      const raiseBy = ps.bet_this_round - s.current_bet
      if (raiseBy >= s.min_raise) {
        s.min_raise = raiseBy
        for (const id of s.seat_order) {
          if (id !== uid && s.player_states[id]?.status === 'active') s.player_states[id].has_acted = false
        }
      }
      s.current_bet = ps.bet_this_round
    }
    ps.status = 'all_in'
    ps.has_acted = true
    s.log.push(`${uid.slice(0, 6)} fait tapis (${shove} DC).`)
  } else {
    return 'Action inconnue'
  }
  s.last_action = { userId: uid, action, amount }
  return null
}

function advanceTurn(s: PokerState) {
  // If only one non-folded → showdown shortcut
  const stillIn = nonFoldedPlayers(s)
  if (stillIn.length <= 1) { s.phase = 'showdown'; return }
  // If betting round over → next phase
  if (isBettingRoundOver(s)) {
    // if all remaining are all-in, fast-forward to showdown
    if (activeOnlyPlayers(s).length <= 1) {
      while (s.phase !== 'river') advancePhaseNoTurn(s)
      collectBetsIntoPot(s)
      s.phase = 'showdown'
      return
    }
    advancePhase(s)
    return
  }
  s.current_player_index = nextActiveIndex(s, s.current_player_index)
}

function advancePhaseNoTurn(s: PokerState) {
  collectBetsIntoPot(s)
  if (s.phase === 'preflop') { s.phase = 'flop'; dealCommunity(s, 3) }
  else if (s.phase === 'flop') { s.phase = 'turn'; dealCommunity(s, 1) }
  else if (s.phase === 'turn') { s.phase = 'river'; dealCommunity(s, 1) }
}

/* ===================== Public view ===================== */
function publicView(s: PokerState, uid: string) {
  const handCounts: Record<string, number> = {}
  for (const id of s.seat_order) handCounts[id] = (s.hands[id] || []).length
  const showdown = s.phase === 'showdown'
  return {
    round_number: s.round_number,
    buy_in: s.buy_in,
    small_blind: s.small_blind,
    big_blind: s.big_blind,
    phase: s.phase,
    community: s.community,
    pot: s.pot,
    current_bet: s.current_bet,
    min_raise: s.min_raise,
    seat_order: s.seat_order,
    dealer_index: s.dealer_index,
    small_blind_index: s.small_blind_index,
    big_blind_index: s.big_blind_index,
    current_player_index: s.current_player_index,
    player_states: s.player_states,
    hand_counts: handCounts,
    last_action: s.last_action,
    winners: s.winners,
    log: s.log.slice(-10),
    my_hand: s.hands[uid] || [],
    // At showdown reveal all non-folded hands
    revealed_hands: showdown
      ? Object.fromEntries(
          nonFoldedPlayers(s).map(id => [id, s.hands[id] || []])
        )
      : {},
  }
}

/* ===================== Persistence ===================== */
async function loadSession(admin: any, roomId: string) {
  return await admin
    .from('game_state_sessions')
    .select('*')
    .eq('room_id', roomId)
    .eq('game_type', 'poker')
    .is('completed_at', null)
    .maybeSingle()
}
async function saveState(admin: any, sessionId: string, state: PokerState) {
  await admin.from('game_state_sessions').update({ state: state as any, updated_at: new Date().toISOString() }).eq('id', sessionId)
}
async function bumpRoom(admin: any, roomId: string) {
  const { data } = await admin.from('game_rooms').select('state_version').eq('id', roomId).maybeSingle()
  const v = (data?.state_version ?? 0) + 1
  await admin.from('game_rooms').update({ state_version: v }).eq('id', roomId)
}

/* ===================== HTTP entry ===================== */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: claimErr } = await userClient.auth.getClaims(token)
    if (claimErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401)
    const uid = claims.claims.sub as string

    const body = await req.json()
    if (!body?.room_id || !body?.type) return json({ error: 'Paramètres manquants' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Membership check
    const { data: member } = await admin.from('room_players').select('user_id').eq('room_id', body.room_id).eq('user_id', uid).maybeSingle()
    if (!member) return json({ error: 'Pas membre de cette partie' }, 403)

    const { data: room } = await admin.from('game_rooms').select('*').eq('id', body.room_id).maybeSingle()
    if (!room) return json({ error: 'Partie introuvable' }, 404)
    if (room.game_type !== 'poker') return json({ error: 'Mauvais type de jeu' }, 400)

    const { data: sessionRow } = await loadSession(admin, body.room_id)

    /* ---------- start_round ---------- */
    if (body.type === 'start') {
      if (room.creator_id !== uid) return json({ error: 'Seul le créateur peut lancer la partie' }, 403)
      if (room.status !== 'in_progress') return json({ error: 'Lance la room d\'abord' }, 400)

      const { data: ps } = await admin
        .from('room_players').select('user_id, joined_at').eq('room_id', body.room_id)
        .order('joined_at', { ascending: true })
      const playerIds = (ps ?? []).map((p: any) => p.user_id) as string[]
      if (playerIds.length < 2) return json({ error: 'Au moins 2 joueurs requis' }, 400)

      const settings = (room.settings ?? {}) as any
      const buyIn = Math.max(10, Math.floor(Number(settings.buy_in ?? 100)))
      const smallBlind = Math.max(1, Math.floor(Number(settings.small_blind ?? Math.max(1, Math.floor(buyIn / 20)))))
      const bigBlind = smallBlind * 2

      // If session exists: this is "next hand" — just deal a new round, reuse stacks
      let prev: PokerState | null = null
      if (sessionRow) prev = sessionRow.state as PokerState

      // Debit buy-ins only on first round
      if (!prev) {
        for (const pid of playerIds) {
          const { data: tx, error: txErr } = await admin.rpc('process_dc_transaction', {
            p_from: pid, p_to: null, p_amount: buyIn,
            p_reason: 'Buy-in Poker', p_metadata: { game: 'poker', room_id: body.room_id },
          })
          if (txErr || (tx as any)?.error) {
            return json({ error: `Solde insuffisant pour un joueur (${(tx as any)?.error ?? txErr?.message})` }, 400)
          }
        }
      }

      const seat = prev?.seat_order ?? playerIds
      const player_states: Record<string, PlayerState> = {}
      for (const id of seat) {
        const prevPs = prev?.player_states[id]
        const stack = prev ? (prevPs?.stack ?? 0) : buyIn
        player_states[id] = {
          stack,
          bet_this_round: 0,
          total_invested: 0,
          status: stack > 0 ? 'active' : 'sitting_out',
          has_acted: false,
        }
      }
      const active = seat.filter(id => player_states[id].status === 'active')
      if (active.length < 2) return json({ error: 'Pas assez de joueurs solvables' }, 400)

      // Dealer rotation
      const dealerIdx = prev
        ? nextActiveIndexStatic(seat, player_states, prev.dealer_index)
        : 0
      const sbIdx = nextActiveIndexStatic(seat, player_states, dealerIdx)
      const bbIdx = nextActiveIndexStatic(seat, player_states, sbIdx)
      const firstToAct = nextActiveIndexStatic(seat, player_states, bbIdx)

      // Blinds
      const sbId = seat[sbIdx], bbId = seat[bbIdx]
      const sbPay = Math.min(smallBlind, player_states[sbId].stack)
      const bbPay = Math.min(bigBlind, player_states[bbId].stack)
      player_states[sbId].stack -= sbPay
      player_states[sbId].bet_this_round = sbPay
      player_states[sbId].total_invested = sbPay
      if (player_states[sbId].stack === 0) player_states[sbId].status = 'all_in'
      player_states[bbId].stack -= bbPay
      player_states[bbId].bet_this_round = bbPay
      player_states[bbId].total_invested = bbPay
      if (player_states[bbId].stack === 0) player_states[bbId].status = 'all_in'

      // Deal hole cards
      const deck = shuffle(buildDeck())
      const hands: Record<string, Card[]> = {}
      let cur = 0
      for (const id of seat) {
        if (player_states[id].status === 'sitting_out') { hands[id] = []; continue }
        hands[id] = [deck[cur++], deck[cur++]]
      }
      const remainingDeck = deck.slice(cur)

      const state: PokerState = {
        round_number: (prev?.round_number ?? 0) + 1,
        buy_in: buyIn,
        small_blind: smallBlind,
        big_blind: bigBlind,
        phase: 'preflop',
        deck: remainingDeck,
        hands,
        community: [],
        pot: 0,
        current_bet: bigBlind,
        min_raise: bigBlind,
        seat_order: seat,
        dealer_index: dealerIdx,
        small_blind_index: sbIdx,
        big_blind_index: bbIdx,
        current_player_index: firstToAct,
        player_states,
        last_action: { userId: bbId, action: 'blind', amount: bbPay },
        winners: null,
        log: [`Main #${(prev?.round_number ?? 0) + 1} — SB ${smallBlind}, BB ${bigBlind}.`],
      }

      if (sessionRow) {
        await saveState(admin, sessionRow.id, state)
      } else {
        await admin.from('game_state_sessions').insert({
          user_id: room.creator_id, game_type: 'poker', room_id: body.room_id, state: state as any,
        })
      }
      // Log blind actions
      await admin.from('poker_actions').insert([
        { room_id: body.room_id, user_id: sbId, round_number: state.round_number, phase: 'preflop', action: 'blind', amount: sbPay },
        { room_id: body.room_id, user_id: bbId, round_number: state.round_number, phase: 'preflop', action: 'blind', amount: bbPay },
      ])
      await bumpRoom(admin, body.room_id)
      return json({ state: publicView(state, uid) })
    }

    if (!sessionRow) return json({ error: 'Partie non démarrée' }, 400)
    const state = sessionRow.state as PokerState

    /* ---------- get_state / get_hand ---------- */
    if (body.type === 'get_state' || body.type === 'get_hand') {
      return json({ state: publicView(state, uid) })
    }

    /* ---------- action ---------- */
    if (body.type === 'action') {
      if (state.phase === 'showdown') return json({ error: 'Main terminée — lancez la suivante' }, 400)
      const err = applyAction(state, uid, body.action, body.amount)
      if (err) return json({ error: err }, 400)

      await admin.from('poker_actions').insert({
        room_id: body.room_id, user_id: uid, round_number: state.round_number,
        phase: state.phase, action: body.action,
        amount: typeof body.amount === 'number' ? body.amount : null,
      })

      advanceTurn(state)

      if (state.phase === 'showdown') {
        await settleShowdown(admin, body.room_id, state)
      }

      await saveState(admin, sessionRow.id, state)
      await bumpRoom(admin, body.room_id)
      return json({ state: publicView(state, uid) })
    }

    return json({ error: 'type inconnu' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function nextActiveIndexStatic(
  seat: string[], ps: Record<string, PlayerState>, from: number,
): number {
  const n = seat.length
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n
    const s = ps[seat[idx]]
    if (s && (s.status === 'active' || s.status === 'all_in')) return idx
  }
  return from
}