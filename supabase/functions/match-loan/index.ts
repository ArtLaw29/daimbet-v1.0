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

    const { request_id, offer_id } = await req.json()
    if (!request_id || !offer_id) return json({ error: 'Paramètres manquants' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [reqRes, offRes] = await Promise.all([
      admin.from('loan_requests').select('*').eq('id', request_id).single(),
      admin.from('loan_offers').select('*').eq('id', offer_id).single(),
    ])
    if (reqRes.error || !reqRes.data) return json({ error: 'Demande introuvable' }, 404)
    if (offRes.error || !offRes.data) return json({ error: 'Offre introuvable' }, 404)

    const reqRow = reqRes.data
    const offRow = offRes.data

    if (reqRow.status !== 'open') return json({ error: 'Demande déjà traitée' }, 409)
    if (offRow.status !== 'open') return json({ error: 'Offre déjà traitée' }, 409)
    if (offRow.request_id && offRow.request_id !== request_id) {
      return json({ error: 'Offre liée à une autre demande' }, 409)
    }

    // Only the borrower (if accepting an offer on their request) or the lender
    // (if "Emprunter" on a spontaneous offer = borrower auto-creates request) can match.
    // Authorization: caller must be borrower of the request.
    if (callerId !== reqRow.borrower_id) {
      return json({ error: 'Seul le demandeur peut accepter une offre' }, 403)
    }

    const principal = Math.min(reqRow.amount, offRow.amount)

    // Disburse DC: lender -> borrower
    const { error: txErr } = await admin.rpc('process_dc_transaction', {
      p_from: offRow.lender_id,
      p_to: reqRow.borrower_id,
      p_amount: principal,
      p_reason: 'loan_disbursement',
      p_metadata: { request_id, offer_id, rate_percent: offRow.rate_percent },
    })
    if (txErr) return json({ error: txErr.message }, 400)

    // Insert the loan
    const { data: loan, error: loanErr } = await admin
      .from('loans')
      .insert({
        request_id,
        offer_id,
        borrower_id: reqRow.borrower_id,
        lender_id: offRow.lender_id,
        principal,
        rate_percent: offRow.rate_percent,
        deadline: offRow.deadline,
        status: 'active',
      })
      .select()
      .single()
    if (loanErr) return json({ error: loanErr.message }, 400)

    // Update statuses
    await admin.from('loan_requests').update({ status: 'matched' }).eq('id', request_id)
    await admin.from('loan_offers').update({ status: 'accepted' }).eq('id', offer_id)
    // Cancel siblings (other offers on same request)
    await admin
      .from('loan_offers')
      .update({ status: 'cancelled' })
      .eq('request_id', request_id)
      .eq('status', 'open')

    // Lookup display names for the Gazette post
    const { data: profs } = await admin
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', [reqRow.borrower_id, offRow.lender_id])
    const nameOf = (id: string) =>
      profs?.find(p => p.user_id === id)?.display_name ?? 'Quelqu\'un'
    const deadlineStr = offRow.deadline
      ? new Date(offRow.deadline).toLocaleDateString('fr-FR')
      : 'libre'
    const content = `🤝 Prêt conclu : ${nameOf(reqRow.borrower_id)} emprunte ${principal} DC à ${nameOf(offRow.lender_id)} (taux ${offRow.rate_percent}%, échéance ${deadlineStr}).`

    await admin.from('gazette_messages').insert({
      content,
      user_id: null,
      is_system_message: true,
    })

    return json({ loan }, 200)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})