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

    const { action } = await req.json();

    if (action === "send_report") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const [betsRes, wagersRes, profilesRes, gazetteRes, proposalsRes, soldeRes, ticketsRes] = await Promise.all([
        supabase.from("bets").select("*"),
        supabase.from("wagers").select("*"),
        supabase.from("profiles").select("*"),
        supabase.from("gazette_messages").select("*"),
        supabase.from("daimocratie_proposals").select("*"),
        supabase.from("solde_history").select("*"),
        supabase.from("tickets").select("*"),
      ]);

      const report = {
        generated_at: new Date().toISOString(),
        reason: "RÉINITIALISATION TOTALE - Rapport pré-suppression",
        data: {
          profiles: profilesRes.data ?? [],
          bets: betsRes.data ?? [],
          wagers: wagersRes.data ?? [],
          gazette_messages: gazetteRes.data ?? [],
          proposals: proposalsRes.data ?? [],
          solde_history: soldeRes.data ?? [],
          tickets: ticketsRes.data ?? [],
        },
      };

      if (resendApiKey) {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Jordaim Belfort <jordaim.belfort@daimbet.com>",
            to: ["B00831041@essec.edu"],
            subject: "🚨 DaimBet - Rapport pré-réinitialisation totale",
            html: `<h2>Rapport pré-réinitialisation totale</h2><p>Date : ${report.generated_at}</p><pre style="font-size:11px;max-height:600px;overflow:auto;">${JSON.stringify(report.data, null, 2).substring(0, 50000)}</pre>`,
          }),
        });
        if (!emailRes.ok) {
          const emailData = await emailRes.json();
          return new Response(JSON.stringify({ error: `Échec envoi rapport: ${emailData?.message || emailRes.status}` }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true, message: "Rapport envoyé" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "execute_reset") {
      await supabase.from("gazette_reactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("gazette_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("ticket_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("tickets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("daimocratie_votes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("daimocratie_proposals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("tierce_suggestions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("wagers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("bet_options").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("bets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("kiss_marry_votes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("solde_history").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("liquidity_injections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("admin_notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("admin_emails_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const adminIds = (adminRoles ?? []).map((r: any) => r.user_id);

      if (adminIds.length > 0) {
        const { data: allProfiles } = await supabase.from("profiles").select("user_id");
        const nonAdminProfiles = (allProfiles ?? []).filter((p: any) => !adminIds.includes(p.user_id));
        for (const p of nonAdminProfiles) {
          await supabase.from("profiles").delete().eq("user_id", p.user_id);
        }
        const { data: allRoles } = await supabase.from("user_roles").select("id, user_id");
        const nonAdminRoleIds = (allRoles ?? []).filter((r: any) => !adminIds.includes(r.user_id)).map((r: any) => r.id);
        for (const rid of nonAdminRoleIds) {
          await supabase.from("user_roles").delete().eq("id", rid);
        }
        const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
        for (const u of (authUsers ?? [])) {
          if (!adminIds.includes(u.id)) {
            await supabase.auth.admin.deleteUser(u.id);
          }
        }
      }

      await supabase.from("platform_settings").update({ value: "false" }).eq("key", "maintenance_mode");

      return new Response(JSON.stringify({ success: true, message: "Réinitialisation totale effectuée" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Action invalide" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
