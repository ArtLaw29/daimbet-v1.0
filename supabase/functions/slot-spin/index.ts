// Server-authoritative 3-reel slot machine.
// Body: { bet: number }
// Returns: { reels: [s,s,s], multiplier, payout, net }

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Symbols (rarer = higher payout). Order matters for visual reel.
const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'] as const
type Symbol = typeof SYMBOLS[number]
// Weights for each symbol (higher = more frequent)
const WEIGHTS: Record<Symbol, number> = {
  '🍒': 30, '🍋': 25, '🔔': 20, '⭐': 12, '💎': 8, '7️⃣': 5,
}
// Payout multipliers for 3 identical symbols
const TRIPLE_PAYOUT: Record<Symbol, number> = {
  '🍒': 5, '🍋': 8, '🔔': 12, '⭐': 25, '💎': 50, '7️⃣': 100,
}

function weightedPick(): Symbol {
  const total = SYMBOLS.reduce((s, sym) => s + WEIGHTS[sym], 0)
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  let r = buf[0] % total
  for (const sym of SYMBOLS) {
    if (r < WEIGHTS[sym]) return sym
    r -= WEIGHTS[sym]
  }
  return SYMBOLS[0]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return j({ error: 'Unauthorized' }, 401)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''))
    if (!claims?.claims) return j({ error: 'Unauthorized' }, 401)
    const uid = claims.claims.sub as string

    const body = await req.json().catch(() => null) as null | { bet: number }
    const bet = Math.max(0, Math.floor(body?.bet ?? 0))
    if (bet <= 0) return j({ error: 'Mise invalide' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: cfgRow } = await admin.from('game_config').select('config').eq('game_key', 'slot_machine').maybeSingle()
    const cfg = ((cfgRow as any)?.config ?? {}) as any
    const betMin = Math.max(1, Number(cfg.betMin ?? 5))
    const betMax = Math.max(betMin, Number(cfg.betMax ?? 100))
    const maxSpinsPerDay = Number(cfg.maxSpinsPerDay ?? 0)
    const cooldownSec = Math.max(0, Number(cfg.cooldownSec ?? 30))

    if (bet < betMin) return j({ error: `Mise minimum ${betMin} DC` }, 400)
    if (bet > betMax) return j({ error: `Mise maximum ${betMax} DC` }, 400)

    // Server-side cooldown (anti-bypass)
    const sinceISO = new Date(Date.now() - cooldownSec * 1000).toISOString()
    const { data: recent } = await admin
      .from('daily_plays')
      .select('played_at')
      .eq('user_id', uid).eq('game_key', 'slot_machine')
      .gte('played_at', sinceISO).limit(1)
    if ((recent?.length ?? 0) > 0) {
      return j({ error: `Cooldown actif (${cooldownSec}s)` }, 429)
    }

    if (maxSpinsPerDay > 0) {
      const since = parisDayStartISO()
      const { count } = await admin
        .from('daily_plays')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid).eq('game_key', 'slot_machine')
        .gte('played_at', since)
      if ((count ?? 0) >= maxSpinsPerDay) {
        return j({ error: 'Limite quotidienne atteinte' }, 429)
      }
    }

    const round_id = crypto.randomUUID()
    const { data: debit, error: debitErr } = await admin.rpc('process_dc_transaction', {
      p_from: uid, p_to: null, p_amount: bet,
      p_reason: 'Mise Machine à sous',
      p_metadata: { game: 'slot_machine', round_id, bet },
    })
    if (debitErr || (debit as any)?.error) {
      return j({ error: (debit as any)?.error ?? debitErr?.message ?? 'Débit refusé' }, 400)
    }

    const reels: Symbol[] = [weightedPick(), weightedPick(), weightedPick()]
    let multiplier = 0
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
      multiplier = TRIPLE_PAYOUT[reels[0]]
    } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
      multiplier = 1 // remboursement (paire)
    }
    const payout = bet * multiplier
    if (payout > 0) {
      await admin.rpc('process_dc_transaction', {
        p_from: null, p_to: uid, p_amount: payout,
        p_reason: multiplier >= 2 ? 'Gain Machine à sous' : 'Paire — remboursement Machine à sous',
        p_metadata: { game: 'slot_machine', round_id, outcome: reels, multiplier },
      })
    }

    await admin.from('daily_plays').insert({ user_id: uid, game_key: 'slot_machine' })

    return j({ reels, multiplier, payout, net: payout - bet, round_id })
  } catch (e) {
    console.error('slot-spin', e)
    return j({ error: (e as Error).message }, 500)
  }
})

function parisDayStartISO(): string {
  const now = new Date()
  const parisDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const parisString = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' })
  const utcString = now.toLocaleString('en-US', { timeZone: 'UTC' })
  const offsetMin = Math.round((new Date(parisString).getTime() - new Date(utcString).getTime()) / 60000)
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${parisDay}T00:00:00${sign}${hh}:${mm}`
}

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}