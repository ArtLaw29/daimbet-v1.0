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

    // This function can be called by a cron or admin — no strict auth needed
    // but verify admin if Authorization header present
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

    if (!unread || unread.length < 2) {
      return new Response(JSON.stringify({ sent: false, reason: `Only ${unread?.length ?? 0} unread notifications` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifLines = unread.map((n: any) =>
      `• [${n.type}] ${n.title}${n.detail ? ` — ${n.detail}` : ""} (${new Date(n.created_at).toLocaleString("fr-FR")})`
    ).join("\n");

    const emailBody = `Bonjour Jordaim Belfort,\n\nTu as ${unread.length} notifications en attente sur DaimBet :\n\n${notifLines}\n\n👉 Connecte-toi au portail admin pour les traiter.\n\n— DaimBet 🦌`;

    await supabase.from("admin_emails_log").insert({
      subject: `🔔 DaimBet : ${unread.length} notifications en attente`,
      body_preview: emailBody.substring(0, 500),
      recipients_json: [ADMIN_EMAIL],
      status: "logged",
    });

    return new Response(JSON.stringify({ sent: true, count: unread.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
