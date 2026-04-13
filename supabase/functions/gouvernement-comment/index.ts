import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ministers, customMinistries, premierMinisterName, premierMinisterRank, premierMinisterBalance, totalPlayers, popularityStats, regaliansFilled, regaliansTotal, totalFilled, maleCount, femaleCount, isADLC } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `Tu es Jordaim Belfort, Président de la République autoproclamé de la promo DAIM. Tu dois commenter de manière sarcastique et drôle le gouvernement que vient de former ${premierMinisterName}, ton nouveau Premier Ministre.

Données du gouvernement :
- Premier Ministre : ${premierMinisterName} (${premierMinisterRank}e au classement DaimCoin sur ${totalPlayers} joueurs, solde : ${premierMinisterBalance} DC)
- Postes remplis : ${totalFilled}/16
- Ministères régaliens remplis : ${regaliansFilled}/${regaliansTotal}
- Parité : ${maleCount} hommes, ${femaleCount} femmes
- Ministres nommés :
${Object.entries(ministers).map(([poste, nom]) => `  • ${poste} : ${nom}`).join('\n')}
${customMinistries && customMinistries.length > 0 ? customMinistries.map((m: any) => `  • ${m.name} (ministère perso) : ${m.person}`).join('\n') : ''}

Stats de popularité des ministres (nombre de nominations dans d'autres gouvernements) :
${popularityStats || 'Aucune donnée encore.'}

${isADLC ? 'IMPORTANT: Au moins 4 membres de la team ADLC (Samory, Léa, Paul, Ghali, Charles P., Christophe) sont dans ce gouvernement. Prends un ton joyeux et ajoute "Bienvenue à la team ADLC !" dans ton commentaire.' : ''}

Consignes :
- Sois sarcastique, drôle, et moqueur mais bienveillant
- Commente la parité (ou son absence)
- Si des postes régaliens manquent, moque-toi gentiment
- Fais une vanne sur le classement DaimCoin du Premier Ministre
- Commente les choix de ministres les plus surprenants
- Reste concis (max 200 mots)
- Signe : "— Jordaim Belfort, Président de la République"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Tu es Jordaim Belfort, président sarcastique et charismatique de la promo DAIM. Tu commentes les gouvernements formés par tes Premiers Ministres avec humour." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaye dans un instant." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erreur IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const comment = data.choices?.[0]?.message?.content || "Le Président est temporairement indisponible. Essayez plus tard.";

    return new Response(JSON.stringify({ comment }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gouvernement-comment error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
