import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
      const errors: string[] = [];

      const deletions = [
        { table: "gazette_reactions", fk: false },
        { table: "gazette_messages", fk: false },
        { table: "ticket_messages", fk: false },
        { table: "tickets", fk: false },
        { table: "daimocratie_votes", fk: false },
        { table: "daimocratie_proposals", fk: false },
        { table: "tierce_suggestions", fk: false },
        { table: "wagers", fk: false },
        { table: "bet_options", fk: false },
        { table: "bets", fk: false },
        { table: "kiss_marry_votes", fk: false },
        { table: "solde_history", fk: false },
        { table: "liquidity_injections", fk: false },
        { table: "admin_notifications", fk: false },
        { table: "admin_emails_log", fk: false },
      ];

      // Delete all data from tables sequentially (order matters for FK)
      for (const { table } of deletions) {
        const { error } = await supabase.from(table).delete().gte("created_at", "1970-01-01");
        if (error) {
          console.error(`Delete ${table} error:`, error.message);
          errors.push(`${table}: ${error.message}`);
          // Try alternative delete
          const { error: err2 } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          if (err2) {
            console.error(`Delete ${table} alt error:`, err2.message);
          }
        } else {
          console.log(`Deleted all from ${table}`);
        }
      }

      // Explicit fallback: force-delete ALL kiss_marry_votes regardless
      const { error: kmErr } = await supabase.from("kiss_marry_votes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (kmErr) {
        console.error("Force delete kiss_marry_votes error:", kmErr.message);
        // Try alternative
        const { error: kmErr2 } = await supabase.from("kiss_marry_votes").delete().gte("created_at", "1970-01-01");
        if (kmErr2) {
          console.error("Force delete kiss_marry_votes alt error:", kmErr2.message);
          errors.push(`kiss_marry_votes (force): ${kmErr2.message}`);
        }
      } else {
        console.log("Force-deleted all kiss_marry_votes");
      }

      // Delete non-admin users
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const adminIds = (adminRoles ?? []).map((r: any) => r.user_id);
      console.log(`Admin IDs preserved: ${adminIds.join(", ")}`);

      if (adminIds.length > 0) {
        // Delete non-admin profiles
        const { data: allProfiles } = await supabase.from("profiles").select("user_id");
        const nonAdminUserIds = (allProfiles ?? []).filter((p: any) => !adminIds.includes(p.user_id)).map((p: any) => p.user_id);
        console.log(`Non-admin profiles to delete: ${nonAdminUserIds.length}`);

        for (const uid of nonAdminUserIds) {
          const { error } = await supabase.from("profiles").delete().eq("user_id", uid);
          if (error) {
            console.error(`Delete profile ${uid}:`, error.message);
            errors.push(`profile ${uid}: ${error.message}`);
          }
        }

        // Delete non-admin roles
        const { error: roleDelErr } = await supabase.from("user_roles").delete().eq("role", "user");
        if (roleDelErr) {
          console.error("Delete user roles:", roleDelErr.message);
        }

        // Delete non-admin auth users
        const { data: { users: authUsers }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        if (listErr) {
          console.error("List auth users error:", listErr.message);
        } else {
          const nonAdminAuthUsers = (authUsers ?? []).filter(u => !adminIds.includes(u.id));
          console.log(`Non-admin auth users to delete: ${nonAdminAuthUsers.length}`);
          for (const u of nonAdminAuthUsers) {
            const { error } = await supabase.auth.admin.deleteUser(u.id);
            if (error) {
              console.error(`Delete auth user ${u.id}:`, error.message);
              errors.push(`auth ${u.id}: ${error.message}`);
            }
          }
        }

        // Reset admin balance to 1000
        for (const adminId of adminIds) {
          await supabase.from("profiles").update({ balance: 1000, has_accepted_charter: true }).eq("user_id", adminId);
        }
      }

      await supabase.from("platform_settings").update({ value: "false" }).eq("key", "maintenance_mode");

      const resultMsg = errors.length > 0
        ? `Réinitialisation effectuée avec ${errors.length} erreur(s): ${errors.slice(0, 5).join("; ")}`
        : "Réinitialisation totale effectuée avec succès";

      return new Response(JSON.stringify({ success: true, message: resultMsg, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Action invalide" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Nuclear reset error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
