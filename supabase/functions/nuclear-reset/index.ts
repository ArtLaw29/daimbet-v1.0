import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const GOVERNMENT_SESSION_ID = "00000000-0000-0000-0000-000000000001";
const FANTASY_SESSION_ID = "00000000-0000-0000-0000-000000000002";
const RESETTABLE_GAME_TYPES = ["sondage", "tournoi", "gouvernement", "fantasy"];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const pushError = (errors: string[], label: string, error: { message: string } | null | undefined) => {
  if (!error) return false;
  console.error(`${label} error:`, error.message);
  errors.push(`${label}: ${error.message}`);
  return true;
};

const deleteAllRows = async (supabase: any, table: string, errors: string[]) => {
  const { error } = await supabase.from(table).delete().neq("id", ZERO_UUID);
  if (!pushError(errors, table, error)) {
    console.log(`Deleted all from ${table}`);
  }
};

const purgeAllGameData = async (supabase: any, errors: string[]) => {
  // Delete ALL participations first (FK constraint: participations → sessions)
  const { error: partErr } = await supabase
    .from("game_participations")
    .delete()
    .neq("id", ZERO_UUID);
  if (!pushError(errors, "game_participations", partErr)) {
    console.log("Deleted all game_participations");
  }

  // Then delete ALL game sessions
  const { error: sessErr } = await supabase
    .from("game_sessions")
    .delete()
    .neq("id", ZERO_UUID);
  if (!pushError(errors, "game_sessions", sessErr)) {
    console.log("Deleted all game_sessions");
  }

  // Re-seed the constant sessions used by Gouvernement & Fantasy Firm
  const { error: seedErr } = await supabase
    .from("game_sessions")
    .upsert([
      { id: GOVERNMENT_SESSION_ID, game_type: "gouvernement", title: "République du DAIM", status: "active", config: {} },
      { id: FANTASY_SESSION_ID, game_type: "fantasy", title: "Fantasy Firm", status: "active", config: {} },
    ], { onConflict: "id" });
  if (!pushError(errors, "game_sessions (reseed)", seedErr)) {
    console.log("Re-seeded constant game_sessions (gouvernement, fantasy)");
  }

};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Non authentifié" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();

    if (authErr || !user) {
      return jsonResponse({ error: "Non authentifié" }, 401);
    }

    const { data: roleCheck } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!roleCheck) {
      return jsonResponse({ error: "Accès refusé" }, 403);
    }

    const { action } = await req.json();

    if (action === "send_report") {
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

        if (!resendApiKey || !lovableApiKey) {
          console.log("No RESEND_API_KEY or LOVABLE_API_KEY configured, skipping report email");
          return jsonResponse({ success: true, message: "Rapport non envoyé (pas de clé email configurée)", skipped: true });
        }

        console.log("Fetching all data for pre-reset report...");
        const [betsRes, wagersRes, profilesRes, gazetteRes, proposalsRes, soldeRes, ticketsRes, gameSessionsRes, gameParticipationsRes] = await Promise.all([
          supabase.from("bets").select("*"),
          supabase.from("wagers").select("*"),
          supabase.from("profiles").select("*"),
          supabase.from("gazette_messages").select("*"),
          supabase.from("daimocratie_proposals").select("*"),
          supabase.from("solde_history").select("*"),
          supabase.from("tickets").select("*"),
          supabase.from("game_sessions").select("*"),
          supabase.from("game_participations").select("*"),
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
            game_sessions: gameSessionsRes.data ?? [],
            game_participations: gameParticipationsRes.data ?? [],
          },
        };

        let reportJson = JSON.stringify(report, null, 2);
        console.log(`Report JSON size: ${reportJson.length} bytes`);

        // Truncate if > 5MB to avoid Resend limits
        const MAX_SIZE = 5 * 1024 * 1024;
        if (reportJson.length > MAX_SIZE) {
          console.log("Report too large, truncating to counts + sample...");
          const truncatedReport = {
            generated_at: report.generated_at,
            reason: report.reason,
            note: "Rapport tronqué (taille > 5 Mo). Seuls les comptages et un échantillon sont inclus.",
            counts: Object.fromEntries(
              Object.entries(report.data).map(([k, v]) => [k, (v as unknown[]).length])
            ),
            sample: Object.fromEntries(
              Object.entries(report.data).map(([k, v]) => [k, (v as unknown[]).slice(0, 10)])
            ),
          };
          reportJson = JSON.stringify(truncatedReport, null, 2);
        }

        // Deno-safe base64 encoding
        const reportBytes = new TextEncoder().encode(reportJson);
        let reportBase64 = "";
        const CHUNK = 8192;
        for (let i = 0; i < reportBytes.length; i += CHUNK) {
          reportBase64 += String.fromCharCode(...reportBytes.slice(i, i + CHUNK));
        }
        reportBase64 = btoa(reportBase64);

        const fileName = `rapport-pre-reinitialisation-${new Date().toISOString().slice(0, 10)}.json`;
        const gatewayUrl = "https://connector-gateway.lovable.dev/resend";

        console.log("Sending report email via Resend...");
        const emailRes = await fetch(`${gatewayUrl}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
            "X-Connection-Api-Key": resendApiKey,
          },
          body: JSON.stringify({
            from: "Jordaim Belfort <jordaim.belfort@daimbet.com>",
            to: ["B00831041@essec.edu"],
            subject: "🚨 DaimBet - Rapport pré-réinitialisation totale",
            html: `<h2>Rapport pré-réinitialisation totale</h2><p>Date : ${report.generated_at}</p><p>Le rapport complet est en pièce jointe.</p><p><strong>Tables sauvegardées :</strong> profiles (${report.data.profiles.length}), bets (${report.data.bets.length}), wagers (${report.data.wagers.length}), gazette (${report.data.gazette_messages.length}), proposals (${report.data.proposals.length}), solde_history (${report.data.solde_history.length}), tickets (${report.data.tickets.length}), game_sessions (${report.data.game_sessions.length}), game_participations (${report.data.game_participations.length})</p>`,
            attachments: [
              {
                filename: fileName,
                content: reportBase64,
              },
            ],
          }),
        });

        const emailData = await emailRes.json();
        console.log(`Resend response status: ${emailRes.status}`, emailData);

        if (!emailRes.ok) {
          return jsonResponse({ error: `Échec envoi rapport: ${emailData?.message || emailData?.error || emailRes.status}` }, 500);
        }

        return jsonResponse({ success: true, message: "Rapport envoyé" });
      } catch (reportErr) {
        console.error("send_report caught error:", reportErr);
        return jsonResponse({ error: `Erreur rapport: ${String(reportErr)}` }, 500);
      }
    }

    if (action === "execute_reset") {
      const errors: string[] = [];

      await purgeAllGameData(supabase, errors);

      const deletions = [
        "gazette_reactions",
        "gazette_messages",
        "ticket_messages",
        "tickets",
        "daimocratie_votes",
        "daimocratie_proposals",
        "tierce_suggestions",
        "wagers",
        "bet_options",
        "bets",
        "kiss_marry_votes",
        "solde_history",
        "liquidity_injections",
        "admin_notifications",
        "admin_emails_log",
      ];

      for (const table of deletions) {
        await deleteAllRows(supabase, table, errors);
      }

      const { data: adminRoles, error: adminRolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (!pushError(errors, "user_roles (admin fetch)", adminRolesError)) {
        const adminIds = (adminRoles ?? []).map((row: { user_id: string }) => row.user_id);
        console.log(`Admin IDs preserved: ${adminIds.join(", ")}`);

        if (adminIds.length > 0) {
          const { data: allProfiles, error: allProfilesError } = await supabase
            .from("profiles")
            .select("user_id");

          if (!pushError(errors, "profiles fetch", allProfilesError)) {
            const nonAdminUserIds = (allProfiles ?? [])
              .filter((profile: { user_id: string }) => !adminIds.includes(profile.user_id))
              .map((profile: { user_id: string }) => profile.user_id);

            if (nonAdminUserIds.length > 0) {
              const { error: deleteProfilesError } = await supabase
                .from("profiles")
                .delete()
                .in("user_id", nonAdminUserIds);
              pushError(errors, "profiles (non-admin)", deleteProfilesError);
            }
          }

          const { error: deleteRolesError } = await supabase
            .from("user_roles")
            .delete()
            .neq("role", "admin");
          pushError(errors, "user_roles (non-admin)", deleteRolesError);

          const {
            data: { users: authUsers },
            error: listErr,
          } = await supabase.auth.admin.listUsers({ perPage: 1000 });

          if (!pushError(errors, "auth users list", listErr)) {
            const nonAdminAuthUsers = (authUsers ?? []).filter((authUser) => !adminIds.includes(authUser.id));
            console.log(`Non-admin auth users to delete: ${nonAdminAuthUsers.length}`);

            for (const authUser of nonAdminAuthUsers) {
              const { error } = await supabase.auth.admin.deleteUser(authUser.id);
              pushError(errors, `auth ${authUser.id}`, error);
            }
          }

          for (const adminId of adminIds) {
            const { error: adminUpdateError } = await supabase
              .from("profiles")
              .update({ balance: 0, has_accepted_charter: true })
              .eq("user_id", adminId);
            pushError(errors, `profiles reset ${adminId}`, adminUpdateError);
          }
        }
      }

      const { error: maintenanceError } = await supabase
        .from("platform_settings")
        .update({ value: "false" })
        .eq("key", "maintenance_mode");
      pushError(errors, "platform_settings (maintenance_mode)", maintenanceError);

      const resultMsg = errors.length > 0
        ? `Réinitialisation effectuée avec ${errors.length} erreur(s): ${errors.slice(0, 5).join("; ")}`
        : "Réinitialisation totale effectuée avec succès";

      return jsonResponse({ success: true, message: resultMsg, errors });
    }

    return jsonResponse({ error: "Action invalide" }, 400);
  } catch (err) {
    console.error("Nuclear reset error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});