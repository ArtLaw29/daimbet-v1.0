import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Body {
  from_user_id?: string | null
  to_user_id?: string | null
  amount: number
  reason: string
  metadata?: Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: claimErr } = await userClient.auth.getClaims(token)
    if (claimErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401)
    const callerId = claims.claims.sub as string

    const body = (await req.json()) as Body
    if (!body || typeof body.amount !== 'number' || body.amount <= 0 || !body.reason) {
      return json({ error: 'Paramètres invalides' }, 400)
    }

    // Authorization: the caller must be the debited account (or admin).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let isAdmin = false
    {
      const { data } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', callerId)
        .eq('role', 'admin')
        .maybeSingle()
      isAdmin = !!data
    }

    if (body.from_user_id && body.from_user_id !== callerId && !isAdmin) {
      return json({ error: 'Tu ne peux débiter que ton propre compte' }, 403)
    }

    const { data, error } = await admin.rpc('process_dc_transaction', {
      p_from: body.from_user_id ?? null,
      p_to: body.to_user_id ?? null,
      p_amount: Math.floor(body.amount),
      p_reason: body.reason,
      p_metadata: body.metadata ?? {},
    })

    if (error) return json({ error: error.message }, 400)
    return json(data, 200)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}