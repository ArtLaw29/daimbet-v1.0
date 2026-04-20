import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Returns the ISO date (YYYY-MM-DD) of the next future reveal date.
// This is used as the period identifier in kiss_marry_votes.month_year.
async function getCurrentPeriodId(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('km_reveal_config')
    .select('reveal_dates')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const dates: string[] = data?.reveal_dates || [];
  const now = Date.now();
  const future = dates
    .map((d) => new Date(d))
    .filter((d) => d.getTime() > now)
    .sort((a, b) => a.getTime() - b.getTime());

  if (future.length > 0) {
    return future[0].toISOString().slice(0, 10);
  }
  // Fallback: no future date configured → use a "post-cycle" sentinel period
  return 'post-cycle';
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Resolve the current period server-side (ignore client-supplied month_year)
    const periodId = await getCurrentPeriodId(supabase);

    // Generate anonymous voter hash server-side (period-bound)
    const secret = supabaseServiceKey;
    const encoder = new TextEncoder();
    const data = encoder.encode(`${user.id}:${periodId}:daimbet-km-secret`);
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, data);
    const voterHash = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    // ── CHECK MODE ──
    if (body.action === "check") {
      const { data: existing } = await supabase
        .from('kiss_marry_votes')
        .select('id')
        .eq('voter_hash', voterHash)
        .eq('month_year', periodId)
        .limit(1);

      return new Response(JSON.stringify({
        has_voted: !!(existing && existing.length > 0),
        period_id: periodId,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── VOTE MODE ──
    const { votes } = body;
    if (!votes) {
      return new Response(JSON.stringify({ error: "Données manquantes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (periodId === 'post-cycle') {
      return new Response(JSON.stringify({ error: "Aucune période de vote n'est ouverte" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already voted this period
    const { data: existing } = await supabase
      .from('kiss_marry_votes')
      .select('id')
      .eq('voter_hash', voterHash)
      .eq('month_year', periodId)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: "Tu as déjà voté pour cette période !" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's display name to auto-exclude
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const userFirstName = profile?.display_name || '';

    const validCategories = ['kiss', 'marry', 'coup_soir', 'plan_q'];
    const rows = [];

    for (const vote of votes) {
      if (!validCategories.includes(vote.category)) continue;
      if (!vote.voted_prenom || vote.voted_prenom.trim() === '') continue;

      if (vote.voted_prenom.toLowerCase().trim() === userFirstName.toLowerCase().trim()) {
        return new Response(JSON.stringify({ error: "Tu ne peux pas voter pour toi-même !" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      rows.push({
        voter_hash: voterHash,
        category: vote.category,
        voted_prenom: vote.voted_prenom.trim(),
        month_year: periodId,
      });
    }

    const submittedCats = rows.map(r => r.category);
    if (!submittedCats.includes('kiss') || !submittedCats.includes('marry')) {
      return new Response(JSON.stringify({ error: "Kiss et Marry sont obligatoires" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertError } = await supabase.from('kiss_marry_votes').insert(rows);
    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Erreur d'enregistrement" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, period_id: periodId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("km-vote error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
