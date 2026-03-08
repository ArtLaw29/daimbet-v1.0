import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // This is a cron/scheduler function — no user auth needed
    const { data: betsToClose, error } = await supabase
      .from("bets")
      .select("id")
      .eq("status", "ouvert")
      .lte("close_date", new Date().toISOString());

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const closed: string[] = [];
    for (const bet of betsToClose || []) {
      const { error: closeErr } = await supabase.rpc("auto_close_bet", { p_bet_id: bet.id });
      if (!closeErr) closed.push(bet.id);
    }

    return new Response(JSON.stringify({ closed_count: closed.length, closed_ids: closed }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
