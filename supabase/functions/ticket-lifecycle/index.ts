import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Auto-close tickets with no messages in 7 days
    // Get all open/en_cours tickets
    const { data: openTickets } = await supabase
      .from("tickets")
      .select("id, status")
      .in("status", ["ouvert", "en_cours"]);

    let closedCount = 0;
    let deletedCount = 0;

    if (openTickets) {
      for (const ticket of openTickets) {
        const { data: lastMsg } = await supabase
          .from("ticket_messages")
          .select("created_at")
          .eq("ticket_id", ticket.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const lastActivity = lastMsg?.created_at || sevenDaysAgo;
        if (new Date(lastActivity) < new Date(sevenDaysAgo)) {
          await supabase
            .from("tickets")
            .update({ status: "resolu" })
            .eq("id", ticket.id);
          closedCount++;
        }
      }
    }

    // 2. Auto-delete tickets inactive for 30 days
    const { data: allTickets } = await supabase
      .from("tickets")
      .select("id");

    if (allTickets) {
      for (const ticket of allTickets) {
        const { data: lastMsg } = await supabase
          .from("ticket_messages")
          .select("created_at")
          .eq("ticket_id", ticket.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const lastActivity = lastMsg?.created_at || thirtyDaysAgo;
        if (new Date(lastActivity) < new Date(thirtyDaysAgo)) {
          // Delete messages first, then ticket
          await supabase
            .from("ticket_messages")
            .delete()
            .eq("ticket_id", ticket.id);
          await supabase
            .from("tickets")
            .delete()
            .eq("id", ticket.id);
          deletedCount++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, closed: closedCount, deleted: deletedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
