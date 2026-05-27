// Daily streak-reminder cron target. Finds users whose streak is about to break
// (last claim was yesterday, current_streak >= 2, no claim today) and inserts an
// in-app notification once per day. Idempotent via streak_reminders_sent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  try {
    // At-risk: claimed yesterday, didn't claim today, streak worth saving
    const { data: atRisk, error } = await supabase
      .from("daily_streaks")
      .select("user_id, current_streak")
      .eq("last_claimed_date", yesterday)
      .gte("current_streak", 2);

    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    for (const row of atRisk ?? []) {
      // Skip if we already pinged them today (any channel)
      const { data: existing } = await supabase
        .from("streak_reminders_sent")
        .select("id")
        .eq("user_id", row.user_id)
        .eq("sent_for_date", today)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      const { error: nErr } = await supabase.from("notifications").insert({
        user_id: row.user_id,
        type: "system",
        title: "Your streak is about to break 🔥",
        body: `You're on a ${row.current_streak}-day streak. Claim today's reward before midnight UTC to keep it alive.`,
        payload: { event: "streak_reminder", streak: row.current_streak, deeplink: "/rewards" },
      });
      if (nErr) { console.error("notif insert failed", row.user_id, nErr.message); continue; }

      await supabase.from("streak_reminders_sent").insert({
        user_id: row.user_id,
        sent_for_date: today,
        channel: "notification",
      });
      sent++;
    }

    return new Response(
      JSON.stringify({ ok: true, candidates: atRisk?.length ?? 0, sent, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("streak-reminder error", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
