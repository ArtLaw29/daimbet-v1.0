import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth: verify JWT + admin role ──
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roleCheck } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { proposal_id } = await req.json();
    if (!proposal_id) {
      return new Response(JSON.stringify({ error: "proposal_id required" }), { status: 400, headers: corsHeaders });
    }

    const { data: proposal, error: pErr } = await supabase
      .from("daimocratie_proposals").select("*").eq("id", proposal_id).single();

    if (pErr || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), { status: 404, headers: corsHeaders });
    }
    if (proposal.status !== "en_attente") {
      return new Response(JSON.stringify({ error: "Already processed" }), { headers: corsHeaders });
    }
    if (proposal.votes_positive < 15 || proposal.votes_negative >= 5) {
      return new Response(JSON.stringify({ ok: false, message: "Threshold not met" }), { headers: corsHeaders });
    }

    const betData: Record<string, unknown> = {
      title: proposal.title,
      type: proposal.type || "binaire",
      category: "culture_daim",
      created_by: proposal.user_id,
      end_date: proposal.end_date_proposed || new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
      is_long_terme: false,
      mise_max_pct: 30,
      status: "ouvert",
    };

    const { data: bet, error: bErr } = await supabase.from("bets").insert(betData).select().single();
    if (bErr || !bet) {
      return new Response(JSON.stringify({ error: "Failed to create bet", detail: bErr?.message }), { status: 500, headers: corsHeaders });
    }

    const options = (proposal.options_json as { label: string; bornes_info?: string }[]) || [{ label: "OUI" }, { label: "NON" }];
    await supabase.from("bet_options").insert(options.map((o) => ({ bet_id: bet.id, label: o.label, bornes_info: o.bornes_info || null })));
    await supabase.from("daimocratie_proposals").update({ status: "valide" }).eq("id", proposal_id);

    const { data: proposerProfile } = await supabase.from("profiles").select("display_name").eq("user_id", proposal.user_id).single();
    await supabase.from("gazette_messages").insert({
      content: `🗳️ La proposition "${proposal.title}" de ${proposerProfile?.display_name || "un Daim"} a été validée par la communauté ! Les mises sont ouvertes 🔥`,
      is_system_message: true,
    });

    return new Response(JSON.stringify({ ok: true, bet_id: bet.id }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
