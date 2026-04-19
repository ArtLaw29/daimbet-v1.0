import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_EMAIL = "B00831041@essec.edu";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Optional admin verification if Authorization header present
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: roleCheck } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!roleCheck) {
          return new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    const { data: unread, error } = await supabase
      .from("admin_notifications")
      .select("id, type, title, detail, created_at")
      .eq("is_read", false)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!unread || unread.length === 0) {
      return new Response(JSON.stringify({ sent: false, reason: "Aucune notification non lue" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY non configurée" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifRows = unread.map((n: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">
          <strong>[${n.type}]</strong> ${n.title}
          ${n.detail ? `<div style="color:#666;font-size:12px;margin-top:2px;">${n.detail}</div>` : ""}
          <div style="color:#999;font-size:11px;margin-top:2px;">${new Date(n.created_at).toLocaleString("fr-FR")}</div>
        </td>
      </tr>`).join("");

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="padding:24px 32px 16px;text-align:center;">
    <span style="font-size:22px;font-weight:700;letter-spacing:6px;color:#111;">DAIMBET 🦌</span>
  </div>
  <div style="border-top:2px solid #111;margin:0 32px;"></div>
  <div style="padding:28px 32px;font-size:15px;line-height:1.6;color:#333;">
    <p>Bonjour Jordaim Belfort,</p>
    <p>Tu as <strong>${unread.length}</strong> notification${unread.length > 1 ? "s" : ""} en attente sur DaimBet :</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">${notifRows}</table>
    <p style="margin-top:24px;">👉 Connecte-toi au portail admin pour les traiter.</p>
  </div>
  <div style="border-top:2px solid #111;margin:0 32px;"></div>
  <div style="padding:16px 32px 24px;text-align:center;">
    <div style="font-weight:700;font-size:14px;color:#111;">Jordaim Belfort</div>
    <div style="font-size:12px;color:#888;margin-top:2px;">CEO — DaimBet Prediction Markets</div>
  </div>
</div>
</body></html>`;

    const subject = `🔔 DaimBet : ${unread.length} notification${unread.length > 1 ? "s" : ""} en attente`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Jordaim Belfort <jordaim.belfort@daimbet.com>",
        reply_to: "jordaim.belfort@daimbet.com",
        to: [ADMIN_EMAIL],
        subject,
        html,
      }),
    });

    const resData = await res.json();
    const success = res.ok;

    await supabase.from("admin_emails_log").insert({
      subject,
      body_preview: `Récap quotidien — ${unread.length} notifications`,
      recipients_json: [ADMIN_EMAIL],
      status: success ? "succes" : "echec",
    });

    if (!success) {
      return new Response(JSON.stringify({ sent: false, error: resData?.message || "Échec envoi" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sent: true, count: unread.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
