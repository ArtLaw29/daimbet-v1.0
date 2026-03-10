import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth: verify JWT + admin role ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roleCheck } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY non configurée" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    if ((todayCount ?? 0) + recipients.length > 100) {
      return new Response(JSON.stringify({
        error: `Limite journalière dépassée (${todayCount}/100)`,
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: { email: string; success: boolean; error?: string }[] = [];

    const buildHtml = (bodyContent: string) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;padding:0;">
  <div style="padding:24px 32px 16px;text-align:center;">
    <span style="font-size:22px;font-weight:700;letter-spacing:6px;color:#111;">DAIMBET 🦌</span>
  </div>
  <div style="border-top:2px solid #111;margin:0 32px;"></div>
  <div style="padding:28px 32px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#333;">
    ${bodyContent}
  </div>
  <div style="border-top:2px solid #111;margin:0 32px;"></div>
  <div style="padding:16px 32px 24px;text-align:center;">
    <div style="font-weight:700;font-size:14px;color:#111;">Jordaim Belfort</div>
    <div style="font-size:12px;color:#888;margin-top:2px;">CEO — DaimBet Prediction Markets</div>
  </div>
</div>
</body></html>`;

    for (const email of recipients) {
      try {
        const htmlContent = buildHtml(body_html || `<p>${subject}</p>`);
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Jordaim Belfort <jordaim.belfort@daimbet.com>",
            reply_to: "jordaim.belfort@daimbet.com",
            to: [email],
            subject,
            html: htmlContent,
          }),
        });
        const resData = await res.json();
        const success = res.ok;
        results.push({ email, success, error: success ? undefined : resData?.message });
        await supabase.from("admin_emails_log").insert({
          subject,
          body_preview: (body_html || "").substring(0, 500),
          recipients_json: [email],
          status: success ? "succes" : "echec",
        });
      } catch (err) {
        results.push({ email, success: false, error: String(err) });
        await supabase.from("admin_emails_log").insert({
          subject, body_preview: (body_html || "").substring(0, 500),
          recipients_json: [email], status: "echec",
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
