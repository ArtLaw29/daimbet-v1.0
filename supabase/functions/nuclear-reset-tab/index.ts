import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const GOVERNMENT_SESSION_ID = "00000000-0000-0000-0000-000000000001";
const FANTASY_SESSION_ID = "00000000-0000-0000-0000-000000000002";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const deleteGameSessionsByTypes = async (
  adminClient: any,
  gameTypes: string[],
  deleted: string[],
) => {
  const { data: sessions, error: sessionsError } = await adminClient
    .from("game_sessions")
    .select("id")
    .in("game_type", gameTypes);

  if (sessionsError) throw sessionsError;

  const sessionIds = (sessions ?? []).map((session: { id: string }) => session.id);

  if (sessionIds.length === 0) {
    deleted.push(`game_sessions (${gameTypes.join(", ")}) — aucune session`);
    return;
  }

  // (content_reports table removed — no longer needed)

  const { error: participationsError } = await adminClient
    .from("game_participations")
    .delete()
    .in("session_id", sessionIds);
  if (participationsError) throw participationsError;
  deleted.push(`game_participations (${gameTypes.join(", ")})`);

  const { error: sessionsDeleteError } = await adminClient
    .from("game_sessions")
    .delete()
    .in("id", sessionIds);
  if (sessionsDeleteError) throw sessionsDeleteError;
  deleted.push(`game_sessions (${gameTypes.join(", ")})`);
};

const deleteFixedSessionParticipations = async (
  adminClient: any,
  sessionId: string,
  label: string,
  deleted: string[],
) => {
  const { error } = await adminClient
    .from("game_participations")
    .delete()
    .eq("session_id", sessionId);

  if (error) throw error;
  deleted.push(label);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Non autorisé" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Non autorisé" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return jsonResponse({ error: "Accès admin requis" }, 403);
    }

    const { tab } = await req.json();
    const validTabs = ["paris", "kiss-marry", "daimocratie", "you-decide", "gouvernement", "fantasy-firm"];
    if (!validTabs.includes(tab)) {
      return jsonResponse({ error: "Onglet invalide" }, 400);
    }

    const deleted: string[] = [];

    if (tab === "paris") {
      await adminClient.from("wagers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("wagers");
      await adminClient.from("tierce_suggestions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("tierce_suggestions");
      await adminClient.from("bet_options").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("bet_options");
      await adminClient.from("bets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("bets");
      await adminClient.from("solde_history").delete().or("reason.ilike.%mise sur%,reason.ilike.%gain pari%,reason.ilike.%rétractation%");
      deleted.push("solde_history (bet-related)");
      await adminClient.from("profiles").update({ balance: 1000 }).neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("profiles balances reset to 1000");
    }

    if (tab === "kiss-marry") {
      await adminClient.from("kiss_marry_votes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("kiss_marry_votes");
    }

    if (tab === "daimocratie") {
      const { data: proposals } = await adminClient.from("daimocratie_proposals").select("id");
      const proposalIds = (proposals ?? []).map((proposal: { id: string }) => proposal.id);

      // (content_reports table removed — no cleanup needed)

      await adminClient.from("daimocratie_votes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("daimocratie_votes");
      await adminClient.from("daimocratie_proposals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("daimocratie_proposals");
      await deleteGameSessionsByTypes(adminClient, ["sondage"], deleted);
    }

    if (tab === "you-decide") {
      await deleteGameSessionsByTypes(adminClient, ["tournoi"], deleted);
    }

    if (tab === "gouvernement") {
      await deleteFixedSessionParticipations(adminClient, GOVERNMENT_SESSION_ID, "game_participations (gouvernement)", deleted);
      await deleteGameSessionsByTypes(adminClient, ["gouvernement"], deleted);
    }

    if (tab === "fantasy-firm") {
      await deleteFixedSessionParticipations(adminClient, FANTASY_SESSION_ID, "game_participations (fantasy)", deleted);
      await deleteGameSessionsByTypes(adminClient, ["fantasy"], deleted);
    }

    await adminClient.from("gazette_messages").insert({
      content: `🔴 L'onglet "${tab}" a été réinitialisé par l'administrateur.`,
      is_system_message: true,
    });

    return jsonResponse({ success: true, deleted });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});