import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find all open bets whose close_date has passed, excluding suspended
    const { data: betsToClose, error } = await supabase
      .from("bets")
      .select("id")
      .eq("status", "ouvert")
      .lte("close_date", new Date().toISOString());

    if (error) {
      console.error("Error fetching bets:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const closed: string[] = [];
    for (const bet of betsToClose || []) {
      const { error: closeErr } = await supabase.rpc("auto_close_bet", {
        p_bet_id: bet.id,
      });
      if (!closeErr) closed.push(bet.id);
      else console.error(`Failed to close bet ${bet.id}:`, closeErr);
    }

    return new Response(
      JSON.stringify({ closed_count: closed.length, closed_ids: closed }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
