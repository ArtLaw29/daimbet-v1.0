import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

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
    const { data: claims, error: claimErr } = await userClient.auth.getClaims(token)
    if (claimErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401)
    const callerId = claims.claims.sub as string

    const { loan_id } = await req.json()
    if (!loan_id) return json({ error: 'loan_id requis' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: loan, error: loanErr } = await admin
      .from('loans')
      .select('*')
      .eq('id', loan_id)
      .single()
    if (loanErr || !loan) return json({ error: 'Prêt introuvable' }, 404)
    if (loan.status !== 'active') return json({ error: 'Prêt déjà remboursé' }, 409)
    if (loan.borrower_id !== callerId) return json({ error: 'Seul l\'emprunteur peut rembourser' }, 403)

    const { error: txErr } = await admin.rpc('process_dc_transaction', {
      p_from: loan.borrower_id,
      p_to: loan.lender_id,
      p_amount: loan.total_due,
      p_reason: 'loan_repayment',
      p_metadata: { loan_id, principal: loan.principal, rate_percent: loan.rate_percent },
    })
    if (txErr) return json({ error: txErr.message }, 400)

    await admin
      .from('loans')
      .update({ status: 'repaid', repaid_at: new Date().toISOString() })
      .eq('id', loan_id)

    const { data: profs } = await admin
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', [loan.borrower_id, loan.lender_id])
    const nameOf = (id: string) =>
      profs?.find(p => p.user_id === id)?.display_name ?? 'Quelqu\'un'
    await admin.from('gazette_messages').insert({
      content: `✅ ${nameOf(loan.borrower_id)} a remboursé son prêt à ${nameOf(loan.lender_id)} (${loan.total_due} DC).`,
      user_id: null,
      is_system_message: true,
    })

    return json({ ok: true }, 200)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})