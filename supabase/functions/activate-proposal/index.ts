import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const POSITIVE_THRESHOLD = 10;
const NEGATIVE_BLOCK = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleRow;

    const { proposal_id } = await req.json();
    if (!proposal_id) {
      return new Response(JSON.stringify({ error: "proposal_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: proposal, error: pErr } = await supabase
      .from("daimocratie_proposals").select("*").eq("id", proposal_id).single();

    if (pErr || !proposal) {
      return new Response(JSON.stringify({ error: "Proposition introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (proposal.status !== "en_attente") {
      return new Response(JSON.stringify({ error: "Déjà traité" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validation: admin OR threshold
    const meetsThreshold = (proposal.votes_positive ?? 0) >= POSITIVE_THRESHOLD && (proposal.votes_negative ?? 0) < NEGATIVE_BLOCK;
    if (!isAdmin && !meetsThreshold) {
      return new Response(JSON.stringify({ error: `Seuil non atteint (${POSITIVE_THRESHOLD} 👍 et < ${NEGATIVE_BLOCK} 👎)` }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const kind = (proposal as any).proposal_kind || "bet";
    const payload = ((proposal as any).payload as Record<string, unknown>) || {};

    const { data: proposerProfile } = await supabase.from("profiles").select("display_name").eq("user_id", proposal.user_id).single();
    const proposerName = proposerProfile?.display_name || "un Daim";

    let createdRefId: string | null = null;
    let gazetteText = "";

    if (kind === "bet") {
      const betData: Record<string, unknown> = {
        title: proposal.title,
        type: proposal.type || payload.type || "binaire",
        category: payload.category || "culture_daim",
        created_by: proposal.user_id,
        end_date: proposal.end_date_proposed || payload.end_date || new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
        is_long_terme: false,
        mise_max_pct: 30,
        status: "ouvert",
        description: payload.description || null,
      };
      const { data: bet, error: bErr } = await supabase.from("bets").insert(betData).select().single();
      if (bErr || !bet) {
        return new Response(JSON.stringify({ error: "Échec création pari", detail: bErr?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const options = (proposal.options_json as { label: string; bornes_info?: string }[]) || (payload.options as any[]) || [{ label: "OUI" }, { label: "NON" }];
      await supabase.from("bet_options").insert(options.map((o: any) => ({ bet_id: bet.id, label: o.label, bornes_info: o.bornes_info || null })));
      createdRefId = bet.id;
      gazetteText = `🗳️ Pari "${proposal.title}" proposé par ${proposerName} validé et ouvert aux mises ! 🔥`;
    } else if (kind === "sondage" || kind === "tournoi" || kind === "gouvernement" || kind === "fantasy") {
      const sessionData: Record<string, unknown> = {
        game_type: kind,
        title: proposal.title,
        subtitle: (payload.subtitle as string) || null,
        status: "active",
        config: payload.config || payload || {},
        created_by: proposal.user_id,
      };
      const { data: session, error: sErr } = await supabase.from("game_sessions").insert(sessionData).select().single();
      if (sErr || !session) {
        return new Response(JSON.stringify({ error: "Échec création session", detail: sErr?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      createdRefId = session.id;
      const emoji = kind === "sondage" ? "📊" : kind === "tournoi" ? "⚔️" : kind === "gouvernement" ? "🏛️" : "⚖️";
      gazetteText = `${emoji} Nouveau ${kind} proposé par ${proposerName} : "${proposal.title}" — Allez-y ! 🎉`;
    } else if (kind === "kiss_marry") {
      // For kiss_marry, just announce the proposal — actual KM cycle is monthly auto.
      gazetteText = `💋 ${proposerName} propose une nouvelle catégorie Kiss/Marry : "${proposal.title}". À discuter avec l'admin !`;
    } else {
      return new Response(JSON.stringify({ error: `Type de proposition inconnu : ${kind}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("daimocratie_proposals").update({ status: "valide" }).eq("id", proposal_id);

    if (gazetteText) {
      await supabase.from("gazette_messages").insert({ content: gazetteText, is_system_message: true });
    }

    return new Response(JSON.stringify({ ok: true, ref_id: createdRefId, kind }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
