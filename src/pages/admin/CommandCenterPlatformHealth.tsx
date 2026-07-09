import { useEffect, useState } from "react";
import { SectionCard, StatTile, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import {
  fetchPlatformHealthSummary,
  fetchStorageUsage,
  fetchUploadFailureBreakdown,
  fetchWebhookFailures,
  formatBytes,
  TRACKED_BUCKETS,
  type PlatformHealthSummary,
  type StorageBucketUsage,
} from "@/lib/platformHealthQueries";
import { supabase } from "@/integrations/supabase/client";
import UserGrowthCard from "@/components/admin/cc/UserGrowthCard";

interface RowLog {
  id: string;
  message: string;
  metadata: { event?: string; [k: string]: unknown } | null;
  created_at: string;
}

export default function CommandCenterPlatformHealth() {
  const [summary, setSummary] = useState<PlatformHealthSummary | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageBucketUsage[]>([]);
  const [storageErr, setStorageErr] = useState<string | null>(null);
  const [uploadFails, setUploadFails] = useState<RowLog[]>([]);
  const [webhookFails, setWebhookFails] = useState<RowLog[]>([]);
  const [rules, setRules] = useState<{ id: string; name: string; is_active: boolean }[]>([]);

  const load = async () => {
    const [s, st, uf, wf, r] = await Promise.all([
      fetchPlatformHealthSummary(),
      fetchStorageUsage(),
      fetchUploadFailureBreakdown(24),
      fetchWebhookFailures(24),
      supabase.from("cost_alert_rules").select("id, name, is_active").order("name"),
    ]);
    setSummary(s.data);
    setSummaryErr(s.error);
    setStorage(st.data);
    setStorageErr(st.error);
    setUploadFails(uf.data as RowLog[]);
    setWebhookFails(wf.data as RowLog[]);
    setRules((r.data as never) ?? []);
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, []);

  const s = summary;
  const uploadTone = s && s.upload_failures_24h > 10 ? "bad" : s && s.upload_failures_24h > 0 ? "warn" : "good";
  const webhookTone = s && s.webhook_failures_24h > 0 ? "bad" : "good";
  const emailTone = s && (s.email_failed_24h > 5 || s.email_pending_over_5m > 0) ? "warn" : "good";
  const pushTone = s && s.push_failures_24h > 5 ? "warn" : "good";
  const rtTone = s && s.realtime_errors_24h > 20 ? "warn" : "good";

  return (
    <div className="space-y-3">
      {summaryErr && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
          Health summary unavailable — sign in as an admin to view.
        </div>
      )}

      <UserGrowthCard />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Upload failures (24h)" value={s?.upload_failures_24h ?? "—"} tone={uploadTone} />
        <StatTile label="Payment/webhook failures (24h)" value={s?.webhook_failures_24h ?? "—"} tone={webhookTone} />
        <StatTile
          label="Email failures (24h)"
          value={s?.email_failed_24h ?? "—"}
          hint={s ? `${s.email_pending_over_5m} pending > 5m` : undefined}
          tone={emailTone}
        />
        <StatTile label="Push failures (24h)" value={s?.push_failures_24h ?? "—"} tone={pushTone} />
        <StatTile
          label="Realtime health"
          value={s?.realtime_errors_24h ?? "—"}
          hint={s ? `${s.realtime_reconnects_24h} reconnects` : undefined}
          tone={rtTone}
        />
        <StatTile label="Total storage" value={formatBytes(storage.reduce((a, b) => a + b.total_bytes, 0))} />
        <StatTile label="Tracked buckets" value={storage.length || "—"} />
        <StatTile label="Cost alert rules" value={rules.length || "—"} tone={rules.length > 0 ? "good" : "warn"} />
      </div>

      <SectionCard title="Storage usage by bucket">
        {storageErr ? (
          <div className="text-[11px] text-rose-300">Couldn't load storage usage: {storageErr}</div>
        ) : storage.length === 0 ? (
          <EmptyState message="No storage objects yet." />
        ) : (
          <ul className="divide-y divide-border/40 text-xs">
            {storage.map((b) => (
              <li key={b.bucket_id} className="py-1.5 flex items-center gap-2">
                <PillBadge>{b.bucket_id}</PillBadge>
                <span className="flex-1 text-muted-foreground">{b.object_count.toLocaleString()} files</span>
                <span className="font-mono">{formatBytes(b.total_bytes)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 text-[10px] text-muted-foreground">
          Tracked: {TRACKED_BUCKETS.join(", ")}
        </div>
      </SectionCard>

      <SectionCard title={`Upload failures — last 24h (${uploadFails.length})`}>
        {uploadFails.length === 0 ? (
          <EmptyState message="No upload failures logged." />
        ) : (
          <ul className="divide-y divide-border/40 text-xs">
            {uploadFails.slice(0, 15).map((r) => (
              <li key={r.id} className="py-1.5 flex items-center gap-2">
                <PillBadge tone="bad">{r.metadata?.event ?? "upload"}</PillBadge>
                <span className="flex-1 truncate">{r.message}</span>
                <span className="text-muted-foreground text-[10px]">
                  {new Date(r.created_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Payment / webhook failures — last 24h (${webhookFails.length})`}>
        {webhookFails.length === 0 ? (
          <EmptyState message="No payment or webhook failures logged." />
        ) : (
          <ul className="divide-y divide-border/40 text-xs">
            {webhookFails.slice(0, 15).map((r) => (
              <li key={r.id} className="py-1.5 flex items-center gap-2">
                <PillBadge tone="bad">{r.metadata?.event ?? "webhook"}</PillBadge>
                <span className="flex-1 truncate">{r.message}</span>
                <span className="text-muted-foreground text-[10px]">
                  {new Date(r.created_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Cost alert rules (${rules.length})`}>
        {rules.length === 0 ? (
          <EmptyState message="No cost alert rules seeded yet." />
        ) : (
          <ul className="divide-y divide-border/40 text-xs">
            {rules.map((r) => (
              <li key={r.id} className="py-1.5 flex items-center gap-2">
                <PillBadge tone={r.is_active ? "good" : "default"}>
                  {r.is_active ? "active" : "off"}
                </PillBadge>
                <span className="flex-1">{r.name}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Manual storage bucket limits — required">
        <p className="text-[11px] text-muted-foreground mb-2">
          Set these limits in the Lovable Cloud backend (Storage → each bucket → Configuration).
          Client-side validation is already active, but server-side limits are the last line of defence.
        </p>
        <ul className="text-xs space-y-1.5">
          <li>
            <PillBadge>avatars / banners / share-cards</PillBadge>{" "}
            <span className="text-muted-foreground">5 MB · image/jpeg, image/png, image/webp</span>
          </li>
          <li>
            <PillBadge>posts / media</PillBadge>{" "}
            <span className="text-muted-foreground">200 MB · image/jpeg, image/png, image/webp, video/mp4, video/quicktime, video/webm</span>
          </li>
          <li>
            <PillBadge>dm-attachments</PillBadge>{" "}
            <span className="text-muted-foreground">25 MB · image/jpeg, image/png, image/webp</span>
          </li>
          <li>
            <PillBadge>verification-docs / evidence</PillBadge>{" "}
            <span className="text-muted-foreground">25 MB · image/jpeg, image/png, image/webp, application/pdf</span>
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
