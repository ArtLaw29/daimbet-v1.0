import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY non configurée. Configure la clé API Resend dans les secrets." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { recipients, subject, body_html } = await req.json();

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "Au moins un destinataire requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!subject?.trim()) {
      return new Response(JSON.stringify({ error: "L'objet est obligatoire" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check daily limit
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from("admin_emails_log")
      .select("*", { count: "exact", head: true })
      .gte("sent_at", todayStart.toISOString())
      .eq("status", "succes");

    const currentCount = todayCount ?? 0;
    if (currentCount + recipients.length > 100) {
      return new Response(JSON.stringify({
        error: `Limite journalière dépassée. Envoyés aujourd'hui : ${currentCount}/100. Cet envoi nécessite ${recipients.length} email(s).`,
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const email of recipients) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Jordaim Belfort <jordaim.belfort@daimbet.com>",
            reply_to: "jordaim.belfort@daimbet.com",
            to: [email],
            subject: subject,
            html: body_html || `<p>${subject}</p>`,
          }),
        });

        const resData = await res.json();

        if (!res.ok) {
          results.push({ email, success: false, error: resData?.message || `HTTP ${res.status}` });
          await supabase.from("admin_emails_log").insert({
            subject,
            body_preview: (body_html || "").substring(0, 500),
            recipients_json: [email],
            status: "echec",
          });
        } else {
          results.push({ email, success: true });
          await supabase.from("admin_emails_log").insert({
            subject,
            body_preview: (body_html || "").substring(0, 500),
            recipients_json: [email],
            status: "succes",
          });
        }
      } catch (err) {
        results.push({ email, success: false, error: String(err) });
        await supabase.from("admin_emails_log").insert({
          subject,
          body_preview: (body_html || "").substring(0, 500),
          recipients_json: [email],
          status: "echec",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(JSON.stringify({
      success: true,
      sent: successCount,
      failed: failCount,
      details: results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
