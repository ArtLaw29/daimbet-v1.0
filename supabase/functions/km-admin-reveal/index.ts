import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Admin-only: trigger an immediate reveal by injecting "now" into reveal_dates.
// The current period closes immediately; the next future date becomes the new period.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify admin role
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load config
    const { data: cfg } = await supabase
      .from('km_reveal_config')
      .select('id, reveal_dates')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!cfg) {
      return new Response(JSON.stringify({ error: "Configuration introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the current (next future) reveal date and replace it with "now"
    const now = new Date();
    const dates: Date[] = (cfg.reveal_dates || []).map((d: string) => new Date(d));
    const futureSorted = dates.filter((d) => d.getTime() > now.getTime()).sort((a, b) => a.getTime() - b.getTime());

    if (futureSorted.length === 0) {
      return new Response(JSON.stringify({ error: "Aucune révélation future à déclencher" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const target = futureSorted[0];
    const newDates = dates.map((d) => (d.getTime() === target.getTime() ? now : d));

    const { error: updErr } = await supabase
      .from('km_reveal_config')
      .update({
        reveal_dates: newDates.map((d) => d.toISOString()),
        updated_at: new Date().toISOString(),
      })
      .eq('id', cfg.id);

    if (updErr) {
      console.error('Update error', updErr);
      return new Response(JSON.stringify({ error: "Erreur de mise à jour" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      revealed_period: target.toISOString().slice(0, 10),
      new_period_starts_in_24h: true,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error('km-admin-reveal error:', e);
    return new Response(JSON.stringify({ error: 'Erreur interne' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
