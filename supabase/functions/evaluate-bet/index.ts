import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, type, category, options } = await req.json();
    if (!title) throw new Error("title required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ score: null, comment: "Évaluation indisponible" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Tu es un expert en paris prédictifs pour une communauté étudiante (ESSEC). Évalue ce pari sur 100 :
- Titre : "${title}"
- Type : ${type}
- Catégorie : ${category}
- Options : ${(options || []).join(", ")}

Critères : engagement potentiel, clarté du titre, équilibre des options, intérêt communautaire.
Réponds UNIQUEMENT avec un JSON : {"score": <0-100>, "comment": "<1 phrase max>"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ score: null, comment: "Évaluation temporairement indisponible (limite atteinte)" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ score: null, comment: "Évaluation indisponible (crédits insuffisants)" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ score: null, comment: "Évaluation indisponible" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*"score"[\s\S]*"comment"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return new Response(JSON.stringify({ score: parsed.score, comment: parsed.comment }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ score: null, comment: "Évaluation indisponible" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("evaluate-bet error:", e);
    return new Response(JSON.stringify({ score: null, comment: "Évaluation indisponible" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
