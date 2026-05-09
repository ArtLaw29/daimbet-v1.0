import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();
    const { data: expired, error } = await supabase
      .from("challenges")
      .select("id, creator_id, mise")
      .eq("status", "ouvert")
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const processed: string[] = [];
    for (const ch of expired || []) {
      const { error: upErr } = await supabase
        .from("challenges")
        .update({ status: "expiré" })
        .eq("id", ch.id)
        .eq("status", "ouvert");
      if (upErr) continue;

      if (ch.mise && ch.mise > 0 && ch.creator_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("balance")
          .eq("user_id", ch.creator_id)
          .single();
        if (profile) {
          await supabase
            .from("profiles")
            .update({ balance: (profile.balance || 0) + ch.mise })
            .eq("user_id", ch.creator_id);
          await supabase.from("solde_history").insert({
            user_id: ch.creator_id,
            delta_dc: ch.mise,
            reason: "Remboursement défi expiré",
          });
        }
      }
      processed.push(ch.id);
    }

    return new Response(JSON.stringify({ expired_count: processed.length, expired_ids: processed }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});