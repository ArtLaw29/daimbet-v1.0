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

    // Auth: verify JWT + admin role
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

    const { option_id, motif } = await req.json();
    if (!option_id || !motif) {
      return new Response(JSON.stringify({ error: "option_id and motif required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get option details
    const { data: option, error: optErr } = await supabase
      .from("bet_options").select("*, bets(title)").eq("id", option_id).single();
    if (optErr || !option) {
      return new Response(JSON.stringify({ error: "Option introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const betTitle = (option as any).bets?.title || "pari inconnu";

    // Get all active wagers on this option
    const { data: wagers } = await supabase
      .from("wagers")
      .select("*")
      .eq("option_id", option_id)
      .eq("is_retracted", false);

    // Refund each wager
    if (wagers && wagers.length > 0) {
      for (const w of wagers) {
        await supabase.from("profiles").update({
          balance: supabase.rpc ? undefined : undefined,
        });
        // Use raw SQL-like approach: increment balance
        const { data: profile } = await supabase.from("profiles").select("balance").eq("user_id", w.user_id).single();
        if (profile) {
          await supabase.from("profiles").update({ balance: profile.balance + w.montant_dc }).eq("user_id", w.user_id);
        }
        await supabase.from("solde_history").insert({
          user_id: w.user_id,
          delta_dc: w.montant_dc,
          reason: `Remboursement: option "${option.label}" supprimée du pari "${betTitle}"`,
        });
        // Mark wager as retracted
        await supabase.from("wagers").update({ is_retracted: true, retracted_at: new Date().toISOString() }).eq("id", w.id);
      }
    }

    // Delete the option
    await supabase.from("bet_options").delete().eq("id", option_id);

    // Recalculate odds for the bet
    await supabase.rpc("recalculate_odds", { p_bet_id: option.bet_id });

    // Check if bet has remaining options
    const { data: remainingOptions } = await supabase.from("bet_options").select("id").eq("bet_id", option.bet_id);
    if (!remainingOptions || remainingOptions.length === 0) {
      // No options left, delete the bet
      await supabase.from("bets").update({ status: "supprime", suppression_motif: motif }).eq("id", option.bet_id);
    }

    // Gazette message
    await supabase.from("gazette_messages").insert({
      content: `⚠️ Jordaim Belfort a supprimé l'option "${option.label}" du pari "${betTitle}". Motif : ${motif}. Les mises ont été remboursées.`,
      is_system_message: true,
    });

    const refundedCount = wagers?.length || 0;
    const refundedTotal = wagers?.reduce((sum, w) => sum + w.montant_dc, 0) || 0;

    return new Response(JSON.stringify({ ok: true, refunded_count: refundedCount, refunded_total: refundedTotal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
