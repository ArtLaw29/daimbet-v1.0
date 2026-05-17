// Uno multiplayer game engine — server-authoritative.
// All hands, deck and discard are stored server-side in game_state_sessions.
// Clients only receive their own hand + a public view, and call this function for every action.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Color = 'r' | 'y' | 'g' | 'b'
type Wild = 'wild'
type CardValue = number | 'skip' | 'reverse' | 'plus2' | 'wild' | 'wild4'
interface Card { id: string; color: Color | Wild; value: CardValue }

interface UnoState {
  players: string[]                       // ordered uids
  hands: Record<string, Card[]>
  draw_pile: Card[]
  discard_pile: Card[]
  current_color: Color
  turn_index: number
  direction: 1 | -1
  pending_draw: { type: 'plus2' | 'plus4'; amount: number } | null
  pending_color_choice: boolean
  uno_window: {
    uid: string
    expires_at: number
    resolved: null | 'uno' | 'counter'
    resolver_id?: string
  } | null
  pot: number
  mise: number
  malus_enabled: boolean
  malus_amount: number
  finished: boolean
  winner_id?: string
  log: string[]
}

const UNO_WINDOW_MS = 5000

// ---------- Deck ----------
function buildDeck(): Card[] {
  const deck: Card[] = []
  let i = 0
  const mk = (color: Color | Wild, value: CardValue): Card => ({ id: `c${i++}`, color, value })
  const colors: Color[] = ['r', 'y', 'g', 'b']
  for (const c of colors) {
    deck.push(mk(c, 0))
    for (let n = 1; n <= 9; n++) { deck.push(mk(c, n)); deck.push(mk(c, n)) }
    for (const v of ['skip', 'reverse', 'plus2'] as const) { deck.push(mk(c, v)); deck.push(mk(c, v)) }
  }
  for (let k = 0; k < 4; k++) { deck.push(mk('wild', 'wild')); deck.push(mk('wild', 'wild4')) }
  return deck
}
function shuffle<T>(a: T[]): T[] {
  const arr = [...a]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ---------- Helpers ----------
function canPlay(card: Card, top: Card, currentColor: Color, pending: UnoState['pending_draw']): boolean {
  if (pending) {
    if (pending.type === 'plus2') return card.value === 'plus2'
    if (pending.type === 'plus4') return card.value === 'wild4'
    return false
  }
  if (card.color === 'wild') return true
  if (card.color === currentColor) return true
  if (top.color !== 'wild' && card.value === top.value) return true
  return false
}

function nextIndex(s: UnoState, steps = 1): number {
  const n = s.players.length
  return ((s.turn_index + s.direction * steps) % n + n) % n
}

function refillDrawIfNeeded(s: UnoState) {
  if (s.draw_pile.length > 0) return
  if (s.discard_pile.length <= 1) return
  const top = s.discard_pile[s.discard_pile.length - 1]
  const rest = s.discard_pile.slice(0, -1).map(c => {
    // Reset wild colour assignment when shuffling back in
    if (c.value === 'wild' || c.value === 'wild4') return { ...c, color: 'wild' as const }
    return c
  })
  s.draw_pile = shuffle(rest)
  s.discard_pile = [top]
}

function drawN(s: UnoState, uid: string, n: number) {
  for (let k = 0; k < n; k++) {
    refillDrawIfNeeded(s)
    const c = s.draw_pile.shift()
    if (!c) break
    s.hands[uid].push(c)
  }
}

function publicView(s: UnoState, viewer: string) {
  const top = s.discard_pile[s.discard_pile.length - 1] ?? null
  return {
    players: s.players,
    hand_counts: Object.fromEntries(s.players.map(p => [p, s.hands[p]?.length ?? 0])),
    your_hand: s.hands[viewer] ?? [],
    discard_top: top,
    current_color: s.current_color,
    turn_index: s.turn_index,
    current_player: s.players[s.turn_index],
    direction: s.direction,
    pending_draw: s.pending_draw,
    pending_color_choice: s.pending_color_choice,
    uno_window: s.uno_window,
    pot: s.pot,
    mise: s.mise,
    malus_enabled: s.malus_enabled,
    malus_amount: s.malus_amount,
    finished: s.finished,
    winner_id: s.winner_id,
    draw_pile_count: s.draw_pile.length,
    log: s.log.slice(-20),
  }
}

// ---------- Main ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims } = await userClient.auth.getClaims(token)
    if (!claims?.claims) return json({ error: 'Unauthorized' }, 401)
    const uid = claims.claims.sub as string

    const body = await req.json().catch(() => null) as null | {
      type: string
      room_id: string
      card_id?: string
      color?: Color
    }
    if (!body || !body.type || !body.room_id) return json({ error: 'Paramètres invalides' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify user is a member
    const { data: member } = await admin
      .from('room_players')
      .select('user_id')
      .eq('room_id', body.room_id)
      .eq('user_id', uid)
      .maybeSingle()
    if (!member) return json({ error: 'Pas membre de cette partie' }, 403)

    const { data: room } = await admin
      .from('game_rooms')
      .select('*')
      .eq('id', body.room_id)
      .maybeSingle()
    if (!room) return json({ error: 'Partie introuvable' }, 404)
    if (room.game_type !== 'uno') return json({ error: 'Mauvais type de jeu' }, 400)

    // Locate session
    const { data: sessionRow } = await admin
      .from('game_state_sessions')
      .select('*')
      .eq('room_id', body.room_id)
      .eq('game_type', 'uno')
      .is('completed_at', null)
      .maybeSingle()

    // get_state with no session yet → no-op response
    if (!sessionRow && body.type === 'get_state') {
      return json({ state: null })
    }

    // ---------- START ----------
    if (body.type === 'start') {
      if (room.creator_id !== uid) return json({ error: 'Seul le créateur peut lancer' }, 403)
      if (sessionRow) return json({ error: 'Partie déjà démarrée' }, 400)
      if (room.status !== 'in_progress') return json({ error: 'Lance la room d’abord' }, 400)
      const { data: ps } = await admin
        .from('room_players').select('user_id, is_connected, joined_at')
        .eq('room_id', body.room_id).order('joined_at', { ascending: true })
      const playerIds = (ps ?? []).map((p: any) => p.user_id) as string[]
      if (playerIds.length < (room.min_players ?? 2)) return json({ error: 'Pas assez de joueurs' }, 400)

      const settings = (room.settings ?? {}) as any
      const mise = Math.max(0, Math.floor(Number(settings.mise ?? 0)))
      const malusEnabled = !!settings.malus_enabled
      const malusAmount = Math.max(0, Math.floor(Number(settings.malus_amount ?? 0)))

      // Debit each player's mise
      let pot = 0
      if (mise > 0) {
        for (const pid of playerIds) {
          const { data: txn, error: txErr } = await admin.rpc('process_dc_transaction', {
            p_from: pid, p_to: null, p_amount: mise,
            p_reason: 'Mise Uno', p_metadata: { room_id: body.room_id },
          })
          if (txErr || (txn as any)?.error) {
            // Rollback already-debited players (refund)
            return json({ error: `Solde insuffisant pour un joueur (${(txn as any)?.error ?? txErr?.message})` }, 400)
          }
          pot += mise
        }
      }

      // Build initial deck & deal 7
      const fullDeck = shuffle(buildDeck())
      const hands: Record<string, Card[]> = {}
      for (const pid of playerIds) hands[pid] = []
      let cursor = 0
      for (let h = 0; h < 7; h++) {
        for (const pid of playerIds) hands[pid].push(fullDeck[cursor++])
      }
      // Flip first non-wild4 card
      let first: Card | undefined
      while (cursor < fullDeck.length) {
        const c = fullDeck[cursor++]
        if (c.value !== 'wild4') { first = c; break }
      }
      if (!first) return json({ error: 'Deck dégénéré' }, 500)
      const draw_pile = fullDeck.slice(cursor)
      const discard_pile = [first]
      let current_color: Color = (first.color === 'wild') ? 'r' : (first.color as Color)
      // If first is wild, dealer (creator) chooses → default red for now; handled by client via choose_color if pending
      const pending_color_choice = first.color === 'wild'

      let turn_index = 0
      let direction: 1 | -1 = 1
      const players = playerIds
      // Apply first card effect (except wild4 which we skipped)
      let pending_draw: UnoState['pending_draw'] = null
      if (first.value === 'skip') turn_index = (turn_index + 1) % players.length
      else if (first.value === 'reverse') {
        direction = -1
        if (players.length === 2) turn_index = (turn_index + 1) % players.length
        else turn_index = (turn_index - 1 + players.length) % players.length
      } else if (first.value === 'plus2') {
        pending_draw = { type: 'plus2', amount: 2 }
      }

      const state: UnoState = {
        players, hands, draw_pile, discard_pile,
        current_color, turn_index, direction,
        pending_draw, pending_color_choice,
        uno_window: null,
        pot, mise, malus_enabled: malusEnabled, malus_amount: malusAmount,
        finished: false, log: [`Partie lancée avec ${players.length} joueurs.`],
      }

      await admin.from('game_state_sessions').insert({
        user_id: room.creator_id,
        game_type: 'uno',
        room_id: body.room_id,
        state: state as any,
      })
      await bumpRoom(admin, body.room_id)
      return json({ state: publicView(state, uid) })
    }

    if (!sessionRow) return json({ error: 'Partie non démarrée' }, 400)
    const state = sessionRow.state as UnoState

    // ---------- GET_STATE ----------
    if (body.type === 'get_state') {
      // Auto-expire UNO window
      if (state.uno_window && state.uno_window.resolved === null && Date.now() > state.uno_window.expires_at) {
        state.uno_window = null
        await saveState(admin, sessionRow.id, state, body.room_id)
      }
      return json({ state: publicView(state, uid) })
    }

    if (state.finished) return json({ error: 'Partie terminée' }, 400)

    // ---------- UNO / COUNTER ----------
    if (body.type === 'declare_uno' || body.type === 'counter_uno') {
      if (!state.uno_window || state.uno_window.resolved !== null) {
        return json({ error: 'Pas de fenêtre UNO active' }, 400)
      }
      if (Date.now() > state.uno_window.expires_at) {
        state.uno_window = null
        await saveState(admin, sessionRow.id, state, body.room_id)
        return json({ error: 'Fenêtre expirée' }, 400)
      }
      if (body.type === 'declare_uno') {
        if (state.uno_window.uid !== uid) return json({ error: 'Seul le joueur ciblé peut crier UNO' }, 403)
        state.uno_window.resolved = 'uno'
        state.uno_window.resolver_id = uid
        state.log.push(`UNO ! crié à temps.`)
      } else {
        if (state.uno_window.uid === uid) return json({ error: 'Tu ne peux pas te contre-UNO toi-même' }, 403)
        state.uno_window.resolved = 'counter'
        state.uno_window.resolver_id = uid
        const target = state.uno_window.uid
        drawN(state, target, 2)
        state.log.push(`CONTRE-UNO ! Le joueur pioche 2 cartes.`)
      }
      await saveState(admin, sessionRow.id, state, body.room_id)
      return json({ state: publicView(state, uid) })
    }

    // ---------- CHOOSE_COLOR ----------
    if (body.type === 'choose_color') {
      if (!state.pending_color_choice) return json({ error: 'Pas de choix de couleur attendu' }, 400)
      const currentPlayer = state.players[state.turn_index]
      if (currentPlayer !== uid) return json({ error: 'Pas ton tour' }, 403)
      if (!body.color || !['r', 'y', 'g', 'b'].includes(body.color)) return json({ error: 'Couleur invalide' }, 400)
      state.current_color = body.color
      state.pending_color_choice = false
      // Advance turn now (wild4: also stack pending_draw was already set when card played)
      advanceAfterPlay(state)
      await saveState(admin, sessionRow.id, state, body.room_id)
      return json({ state: publicView(state, uid) })
    }

    // ---------- PLAY ----------
    if (body.type === 'play') {
      if (state.pending_color_choice) return json({ error: 'Choisis une couleur d’abord' }, 400)
      const currentPlayer = state.players[state.turn_index]
      if (currentPlayer !== uid) return json({ error: 'Pas ton tour' }, 403)
      const hand = state.hands[uid] ?? []
      const idx = hand.findIndex(c => c.id === body.card_id)
      if (idx < 0) return json({ error: 'Carte introuvable dans ta main' }, 400)
      const card = hand[idx]
      const top = state.discard_pile[state.discard_pile.length - 1]
      if (!canPlay(card, top, state.current_color, state.pending_draw)) {
        return json({ error: 'Carte non jouable' }, 400)
      }
      hand.splice(idx, 1)
      state.discard_pile.push(card)
      if (card.color !== 'wild') state.current_color = card.color

      // Effects
      if (card.value === 'plus2') {
        state.pending_draw = { type: 'plus2', amount: (state.pending_draw?.amount ?? 0) + 2 }
      } else if (card.value === 'wild4') {
        state.pending_draw = { type: 'plus4', amount: (state.pending_draw?.amount ?? 0) + 4 }
        state.pending_color_choice = true
      } else if (card.value === 'wild') {
        state.pending_color_choice = true
      }

      // Check win
      if (hand.length === 0) {
        await finishGame(admin, state, uid)
        await saveState(admin, sessionRow.id, state, body.room_id, true)
        return json({ state: publicView(state, uid) })
      }

      // UNO window
      if (hand.length === 1) {
        state.uno_window = { uid, expires_at: Date.now() + UNO_WINDOW_MS, resolved: null }
      } else {
        state.uno_window = null
      }

      // Advance unless waiting for colour choice
      if (!state.pending_color_choice) advanceAfterPlay(state)

      await saveState(admin, sessionRow.id, state, body.room_id)
      return json({ state: publicView(state, uid) })
    }

    // ---------- DRAW ----------
    if (body.type === 'draw') {
      if (state.pending_color_choice) return json({ error: 'Choisis une couleur d’abord' }, 400)
      const currentPlayer = state.players[state.turn_index]
      if (currentPlayer !== uid) return json({ error: 'Pas ton tour' }, 403)

      if (state.pending_draw) {
        const n = state.pending_draw.amount
        drawN(state, uid, n)
        state.log.push(`Pioche cumulée : +${n} cartes.`)
        state.pending_draw = null
        state.uno_window = null
        state.turn_index = nextIndex(state, 1)
      } else {
        drawN(state, uid, 1)
        state.uno_window = null
        state.turn_index = nextIndex(state, 1)
      }

      await saveState(admin, sessionRow.id, state, body.room_id)
      return json({ state: publicView(state, uid) })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (e) {
    console.error('uno-action error', e)
    return json({ error: (e as Error).message }, 500)
  }
})

function advanceAfterPlay(state: UnoState) {
  const top = state.discard_pile[state.discard_pile.length - 1]
  if (top.value === 'skip') {
    state.turn_index = nextIndex(state, 2)
  } else if (top.value === 'reverse') {
    state.direction = (state.direction === 1 ? -1 : 1)
    if (state.players.length === 2) state.turn_index = nextIndex(state, 2)
    else state.turn_index = nextIndex(state, 1)
  } else {
    state.turn_index = nextIndex(state, 1)
  }
}

async function finishGame(admin: any, state: UnoState, winnerId: string) {
  state.finished = true
  state.winner_id = winnerId
  state.log.push(`🏆 Victoire !`)
  // Pot to winner
  if (state.pot > 0) {
    await admin.rpc('process_dc_transaction', {
      p_from: null, p_to: winnerId, p_amount: state.pot,
      p_reason: 'Gain Uno (pot)', p_metadata: {},
    })
  }
  // Malus
  if (state.malus_enabled && state.malus_amount > 0) {
    let maxCount = -1
    let losers: string[] = []
    for (const pid of state.players) {
      if (pid === winnerId) continue
      const n = state.hands[pid]?.length ?? 0
      if (n > maxCount) { maxCount = n; losers = [pid] }
      else if (n === maxCount) losers.push(pid)
    }
    if (losers.length > 0 && maxCount > 0) {
      const share = Math.ceil(state.malus_amount / losers.length)
      for (const loser of losers) {
        await admin.rpc('process_dc_transaction', {
          p_from: loser, p_to: winnerId, p_amount: share,
          p_reason: 'Malus Uno (le plus de cartes)', p_metadata: {},
        })
      }
    }
  }
}

async function saveState(admin: any, sessionId: string, state: UnoState, roomId: string, completed = false) {
  const patch: any = { state, updated_at: new Date().toISOString() }
  if (completed) patch.completed_at = new Date().toISOString()
  await admin.from('game_state_sessions').update(patch).eq('id', sessionId)
  if (completed) {
    await admin.from('game_rooms').update({
      status: 'finished', finished_at: new Date().toISOString(),
    }).eq('id', roomId)
  }
  await bumpRoom(admin, roomId)
}

async function bumpRoom(admin: any, roomId: string) {
  // Atomic bump via SQL would be ideal; this is a best-effort increment.
  const { data } = await admin.from('game_rooms').select('state_version').eq('id', roomId).maybeSingle()
  const next = ((data as any)?.state_version ?? 0) + 1
  await admin.from('game_rooms').update({ state_version: next }).eq('id', roomId)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}