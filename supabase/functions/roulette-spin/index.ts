// Server-authoritative roulette spin.
// Body: { bets: Array<{ type: string; numbers?: number[]; amount: number; color?: 'r'|'b' }> }
// Returns: { number, color, payouts, net, balance }

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

interface BetItem {
  type: 'straight' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'dozen' | 'column'
  numbers?: number[] // straight: single, dozen/column: [start,end] inclusive
  amount: number
}

function colorOf(n: number): 'r' | 'b' | 'g' { return n === 0 ? 'g' : (RED.has(n) ? 'r' : 'b') }

function payoutFor(bet: BetItem, n: number): number {
  const a = bet.amount
  if (a <= 0) return 0
  if (bet.type === 'straight') {
    return (bet.numbers?.[0] === n) ? a * 36 : 0
  }
  if (n === 0) return 0
  switch (bet.type) {
    case 'red':   return colorOf(n) === 'r' ? a * 2 : 0
    case 'black': return colorOf(n) === 'b' ? a * 2 : 0
    case 'even':  return n % 2 === 0 ? a * 2 : 0
    case 'odd':   return n % 2 === 1 ? a * 2 : 0
    case 'low':   return n >= 1 && n <= 18 ? a * 2 : 0
    case 'high':  return n >= 19 && n <= 36 ? a * 2 : 0
    case 'dozen': {
      const [s, e] = bet.numbers ?? []
      return (n >= s && n <= e) ? a * 3 : 0
    }
    case 'column': {
      // numbers contains the explicit list (e.g. [1,4,7,...])
      return bet.numbers?.includes(n) ? a * 3 : 0
    }
  }
  return 0
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

    const body = await req.json().catch(() => null) as null | { bets: BetItem[] }
    if (!body?.bets || !Array.isArray(body.bets) || body.bets.length === 0) {
      return j({ error: 'Aucune mise' }, 400)
    }
    const total = body.bets.reduce((s, b) => s + Math.max(0, Math.floor(b.amount || 0)), 0)
    if (total <= 0) return j({ error: 'Mise totale nulle' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Load config
    const { data: cfgRow } = await admin.from('game_config').select('config').eq('game_key', 'roulette').maybeSingle()
    const cfg = ((cfgRow as any)?.config ?? {}) as any
    const betMin = Math.max(5, Number(cfg.betMin ?? 5))
    const betMax = Math.max(betMin, Number(cfg.betMax ?? 200))
    const maxPlaysPerDay = Number(cfg.maxPlaysPerDay ?? 0)

    if (total < betMin) return j({ error: `Mise totale < ${betMin} DC` }, 400)
    if (total > betMax) return j({ error: `Mise totale > ${betMax} DC` }, 400)

    // Daily limit check (Paris timezone)
    if (maxPlaysPerDay > 0) {
      const since = parisDayStartISO()
      const { count } = await admin
        .from('daily_plays')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid).eq('game_key', 'roulette')
        .gte('played_at', since)
      if ((count ?? 0) >= maxPlaysPerDay) {
        return j({ error: 'Limite quotidienne atteinte' }, 429)
      }
    }

    // Round id
    const round_id = crypto.randomUUID()

    // Debit total
    const { data: debit, error: debitErr } = await admin.rpc('process_dc_transaction', {
      p_from: uid, p_to: null, p_amount: total,
      p_reason: 'Mise Roulette',
      p_metadata: { game: 'roulette', round_id, bet: body.bets },
    })
    if (debitErr || (debit as any)?.error) {
      return j({ error: (debit as any)?.error ?? debitErr?.message ?? 'Débit refusé' }, 400)
    }

    // RNG
    const number = secureRandomInt(0, 36)
    const color = colorOf(number)
    let gross = 0
    const breakdown: any[] = []
    for (const b of body.bets) {
      const p = payoutFor(b, number)
      gross += p
      if (p > 0) breakdown.push({ ...b, payout: p })
    }

    if (gross > 0) {
      await admin.rpc('process_dc_transaction', {
        p_from: null, p_to: uid, p_amount: gross,
        p_reason: 'Gain Roulette',
        p_metadata: { game: 'roulette', round_id, outcome: number, breakdown },
      })
    }

    await admin.from('daily_plays').insert({ user_id: uid, game_key: 'roulette' })

    return j({ number, color, gross, net: gross - total, total_bet: total, breakdown, round_id })
  } catch (e) {
    console.error('roulette-spin', e)
    return j({ error: (e as Error).message }, 500)
  }
})

function secureRandomInt(min: number, max: number): number {
  const range = max - min + 1
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return min + (buf[0] % range)
}

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