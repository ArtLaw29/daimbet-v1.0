import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Accès admin requis" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tab } = await req.json();
    const validTabs = ["paris", "kiss-marry", "daimocratie", "you-decide", "gouvernement", "fantasy-firm"];
    if (!validTabs.includes(tab)) {
      return new Response(JSON.stringify({ error: "Onglet invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let deleted: string[] = [];

    if (tab === "paris") {
      // Delete wagers first (FK to bet_options and bets)
      await adminClient.from("wagers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("wagers");
      // Delete tierce suggestions
      await adminClient.from("tierce_suggestions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("tierce_suggestions");
      // Delete bet options
      await adminClient.from("bet_options").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("bet_options");
      // Delete bets
      await adminClient.from("bets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("bets");
      // Clean solde_history related to bets
      await adminClient.from("solde_history").delete().or("reason.ilike.%mise sur%,reason.ilike.%gain pari%,reason.ilike.%rétractation%");
      deleted.push("solde_history (bet-related)");
      // Reset all balances to 1000
      await adminClient.from("profiles").update({ balance: 1000 }).neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("profiles balances reset to 1000");
    }

    if (tab === "kiss-marry") {
      await adminClient.from("kiss_marry_votes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("kiss_marry_votes");
    }

    if (tab === "daimocratie") {
      await adminClient.from("daimocratie_votes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("daimocratie_votes");
      await adminClient.from("daimocratie_proposals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      deleted.push("daimocratie_proposals");
    }

    // Future tabs (you-decide, gouvernement, fantasy-firm) — no tables yet
    if (["you-decide", "gouvernement", "fantasy-firm"].includes(tab)) {
      deleted.push("(aucune donnée à supprimer — onglet vide)");
    }

    // Post gazette system message
    await adminClient.from("gazette_messages").insert({
      content: `🔴 L'onglet "${tab}" a été réinitialisé par l'administrateur.`,
      is_system_message: true,
    });

    return new Response(JSON.stringify({ success: true, deleted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
