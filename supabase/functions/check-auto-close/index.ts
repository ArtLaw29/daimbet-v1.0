import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({
      error: "Unauthorized",
      debug: {
        env_secret_present: !!cronSecret,
        env_secret_length: cronSecret?.length ?? 0,
        env_secret_prefix: cronSecret?.slice(0, 6) ?? null,
        provided_length: provided?.length ?? 0,
        provided_prefix: provided?.slice(0, 6) ?? null,
      }
    }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

    // Also auto-resolve sondages whose end_date has passed
    const nowIso = new Date().toISOString();
    const { data: sondagesToResolve } = await supabase
      .from("game_sessions")
      .select("id, config")
      .eq("game_type", "sondage")
      .in("status", ["active", "voting"]);

    const resolved: string[] = [];
    for (const s of sondagesToResolve || []) {
      const endDate = (s as any).config?.end_date;
      if (!endDate) continue;
      if (new Date(endDate).toISOString() > nowIso) continue;
      const { error: resErr } = await supabase.rpc("resolve_sondage", { p_session_id: s.id });
      if (!resErr) resolved.push(s.id);
    }

    return new Response(JSON.stringify({
      closed_count: closed.length, closed_ids: closed,
      resolved_sondages_count: resolved.length, resolved_sondages_ids: resolved,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
