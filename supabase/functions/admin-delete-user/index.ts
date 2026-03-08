import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id manquant" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Prevent self-deletion
    if (target_user_id === user.id) {
      return new Response(JSON.stringify({ error: "Impossible de supprimer son propre compte" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Delete related data in order
    const tables = [
      { table: "gazette_reactions", col: "user_id" },
      { table: "wagers", col: "user_id" },
      { table: "solde_history", col: "user_id" },
      { table: "daimocratie_votes", col: "user_id" },
      { table: "gazette_messages", col: "user_id" },
      { table: "tierce_suggestions", col: "suggested_by" },
      { table: "daimocratie_proposals", col: "user_id" },
    ];

    for (const { table, col } of tables) {
      await adminClient.from(table).delete().eq(col, target_user_id);
    }

    // Delete ticket messages then tickets
    const { data: userTickets } = await adminClient.from("tickets").select("id").eq("user_id", target_user_id);
    if (userTickets && userTickets.length > 0) {
      const ticketIds = userTickets.map((t: any) => t.id);
      for (const tid of ticketIds) {
        await adminClient.from("ticket_messages").delete().eq("ticket_id", tid);
      }
      await adminClient.from("tickets").delete().eq("user_id", target_user_id);
    }

    // Delete roles and profile
    await adminClient.from("user_roles").delete().eq("user_id", target_user_id);
    await adminClient.from("profiles").delete().eq("user_id", target_user_id);

    // Delete auth user
    const { error } = await adminClient.auth.admin.deleteUser(target_user_id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
