import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { votes, month_year } = await req.json();
    if (!votes || !month_year) {
      return new Response(JSON.stringify({ error: "Données manquantes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate anonymous voter hash server-side
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // use as HMAC key
    const encoder = new TextEncoder();
    const data = encoder.encode(`${user.id}:${month_year}:daimbet-km-secret`);
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, data);
    const voterHash = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Check if already voted this month
    const { data: existing } = await supabase
      .from('kiss_marry_votes')
      .select('id')
      .eq('voter_hash', voterHash)
      .eq('month_year', month_year)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: "Tu as déjà voté ce mois-ci !" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's display name to auto-exclude
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const userFirstName = profile?.display_name || '';

    // Validate votes
    const validCategories = ['kiss', 'marry', 'coup_soir', 'plan_q'];
    const rows = [];

    for (const vote of votes) {
      if (!validCategories.includes(vote.category)) continue;
      if (!vote.voted_prenom || vote.voted_prenom.trim() === '') continue;

      // Auto-exclusion: reject if voting for themselves
      if (vote.voted_prenom.toLowerCase().trim() === userFirstName.toLowerCase().trim()) {
        return new Response(JSON.stringify({ error: "Tu ne peux pas voter pour toi-même !" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      rows.push({
        voter_hash: voterHash,
        category: vote.category,
        voted_prenom: vote.voted_prenom.trim(),
        month_year,
      });
    }

    // Check required categories
    const submittedCats = rows.map(r => r.category);
    if (!submittedCats.includes('kiss') || !submittedCats.includes('marry')) {
      return new Response(JSON.stringify({ error: "Kiss et Marry sont obligatoires" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert votes (using service role to bypass RLS)
    const { error: insertError } = await supabase.from('kiss_marry_votes').insert(rows);
    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Erreur d'enregistrement" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return the voter hash so client can store it for "already voted" check
    return new Response(JSON.stringify({ success: true, voter_hash: voterHash }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("km-vote error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
