import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hourly tick: for each reveal date that is older than 24h and not yet reset,
// delete that period's votes (they've been revealed for a full day).
serve(async (req) => {
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

    const { data: cfg } = await supabase
      .from('km_reveal_config')
      .select('id, reveal_dates, last_reset_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!cfg) {
      return new Response(JSON.stringify({ ok: true, msg: 'no config' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const lastReset = cfg.last_reset_at ? new Date(cfg.last_reset_at).getTime() : 0;

    const dates: Date[] = (cfg.reveal_dates || []).map((d: string) => new Date(d));
    // Find dates that are at least 24h in the past AND newer than last_reset_at
    const toReset = dates
      .filter((d) => now - d.getTime() >= oneDayMs && d.getTime() > lastReset)
      .sort((a, b) => a.getTime() - b.getTime());

    if (toReset.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalDeleted = 0;
    let latestProcessed: Date | null = null;
    for (const revealDate of toReset) {
      const periodId = revealDate.toISOString().slice(0, 10);
      const { error, count } = await supabase
        .from('kiss_marry_votes')
        .delete({ count: 'exact' })
        .eq('month_year', periodId);
      if (error) {
        console.error('Delete error for period', periodId, error);
        continue;
      }
      totalDeleted += count || 0;
      latestProcessed = revealDate;
    }

    if (latestProcessed) {
      await supabase
        .from('km_reveal_config')
        .update({ last_reset_at: latestProcessed.toISOString(), updated_at: new Date().toISOString() })
        .eq('id', cfg.id);
    }

    return new Response(JSON.stringify({ ok: true, processed: toReset.length, deleted: totalDeleted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error('km-reveal-tick error:', e);
    return new Response(JSON.stringify({ error: 'Erreur interne' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
