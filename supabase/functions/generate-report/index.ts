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

    const { period = "all", format = "json" } = await req.json().catch(() => ({}));

    let dateFrom: string | null = null;
    const now = new Date();
    if (period === "week") dateFrom = new Date(now.getTime() - 7 * 86400000).toISOString();
    else if (period === "month") dateFrom = new Date(now.getTime() - 30 * 86400000).toISOString();

    const dateFilter = (query: any) => dateFrom ? query.gte("created_at", dateFrom) : query;

    const [betsRes, wagersRes, injectionsRes, gazetteRes, proposalsRes, soldeRes, profilesRes, ticketsRes, ticketMsgsRes] = await Promise.all([
      dateFilter(supabase.from("bets").select("id, title, status, category, type, created_at, updated_at, suppression_motif")).order("created_at", { ascending: false }),
      dateFilter(supabase.from("wagers").select("id, bet_id, user_id, montant_dc, cote_au_moment_mise, is_retracted, created_at")).order("created_at", { ascending: false }),
      dateFilter(supabase.from("liquidity_injections").select("*").order("triggered_at", { ascending: false })),
      dateFilter(supabase.from("gazette_messages").select("id, content, user_id, is_system_message, flag_score, flag_status, created_at")).order("created_at", { ascending: false }),
      dateFilter(supabase.from("daimocratie_proposals").select("id, title, status, user_id, votes_positive, votes_negative, created_at")).order("created_at", { ascending: false }),
      dateFilter(supabase.from("solde_history").select("id, user_id, delta_dc, reason, created_at")).order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, display_name, balance, created_at, is_suspended"),
      dateFilter(supabase.from("tickets").select("id, user_id, subject, status, created_at, admin_replied_at")).order("created_at", { ascending: false }),
      supabase.from("ticket_messages").select("id, ticket_id, sender, content, created_at").order("created_at", { ascending: true }),
    ]);

    const report = {
      generated_at: now.toISOString(),
      period,
      summary: {
        total_users: profilesRes.data?.length ?? 0,
        total_bets: betsRes.data?.length ?? 0,
        total_wagers: wagersRes.data?.filter((w: any) => !w.is_retracted).length ?? 0,
        total_volume_dc: wagersRes.data?.filter((w: any) => !w.is_retracted).reduce((s: number, w: any) => s + w.montant_dc, 0) ?? 0,
      },
      bets: betsRes.data ?? [],
      wagers: (wagersRes.data ?? []).map((w: any) => ({ ...w, user_id: w.user_id.substring(0, 8) + "..." })),
      liquidity_injections: injectionsRes.data ?? [],
      gazette_messages: gazetteRes.data ?? [],
      proposals: proposalsRes.data ?? [],
      solde_modifications: soldeRes.data ?? [],
      tickets: (ticketsRes.data ?? []).map((t: any) => {
        const msgs = (ticketMsgsRes.data ?? []).filter((m: any) => m.ticket_id === t.id);
        const userName = (profilesRes.data ?? []).find((p: any) => p.user_id === t.user_id)?.display_name || "Inconnu";
        return { ...t, user_name: userName, messages: msgs };
      }),
      users_anonymized: (profilesRes.data ?? []).map((p: any) => ({
        id_hash: p.user_id.substring(0, 8),
        display_name: p.display_name,
        balance: p.balance,
        registered_at: p.created_at,
        is_suspended: p.is_suspended,
      })),
    };

    if (format === "csv") {
      const lines = ["type,title,status,category,created_at,updated_at"];
      for (const b of report.bets) {
        lines.push(`"${(b as any).type}","${(b as any).title.replace(/"/g, '""')}","${(b as any).status}","${(b as any).category}","${(b as any).created_at}","${(b as any).updated_at}"`);
      }
      return new Response(lines.join("\n"), {
        headers: { ...corsHeaders, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="daimbet-report-${period}.csv"` },
      });
    }

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="daimbet-report-${period}.json"` },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
