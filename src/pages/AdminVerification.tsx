import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, FileText, Loader2 } from "lucide-react";

interface Req {
  id: string;
  user_id: string;
  status: string;
  plan: string;
  legal_name: string;
  category: string;
  brand_name: string | null;
  website_url: string | null;
  follower_count: number | null;
  reason: string;
  id_document_path: string | null;
  business_document_path: string | null;
  selfie_path: string | null;
  created_at: string;
  review_notes: string | null;
  profiles?: { username: string | null; profile_photo_url: string | null; followers_count: number };
}

async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("verification-docs").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export default function AdminVerification() {
  const [items, setItems] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Req | null>(null);
  const [notes, setNotes] = useState("");
  const [docs, setDocs] = useState<{ id?: string; selfie?: string; biz?: string }>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = async () => {
    setLoading(true);
    const q = supabase.from("verification_requests")
      .select("*, profiles:profiles!verification_requests_user_id_fkey(username,profile_photo_url,followers_count)")
      .order("created_at", { ascending: false }).limit(100);
    const { data, error } = filter === "pending"
      ? await q.in("status", ["pending", "more_info_required"])
      : await q;
    if (error) toast.error(error.message);
    setItems((data as Req[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  useEffect(() => {
    if (!active) { setDocs({}); return; }
    setNotes(active.review_notes ?? "");
    Promise.all([
      signedUrl(active.id_document_path),
      signedUrl(active.selfie_path),
      signedUrl(active.business_document_path),
    ]).then(([id, selfie, biz]) => setDocs({ id: id ?? undefined, selfie: selfie ?? undefined, biz: biz ?? undefined }));
  }, [active]);

  const decide = async (decision: "approved" | "rejected" | "more_info_required" | "revoked") => {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_decide_verification", {
      _request_id: active.id, _decision: decision, _notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${decision}`);
    setActive(null);
    load();
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-serif font-bold">Verification Review</h1>
        </div>
        <div className="flex gap-2">
          <Button variant={filter === "pending" ? "default" : "outline"} size="sm" onClick={() => setFilter("pending")}>Pending</Button>
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>All</Button>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4">
        <div className="space-y-2 max-h-[75vh] overflow-y-auto">
          {loading && <Loader2 className="h-5 w-5 animate-spin mx-auto" />}
          {!loading && items.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No requests.</p>}
          {items.map((r) => (
            <Card key={r.id} onClick={() => setActive(r)}
              className={`p-3 cursor-pointer hover:bg-muted/50 ${active?.id === r.id ? "border-primary" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">@{r.profiles?.username ?? r.legal_name}</p>
                  <p className="text-xs text-muted-foreground">{r.category} · {r.plan} · {r.follower_count?.toLocaleString() ?? "?"} followers</p>
                </div>
                <Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "destructive"}>{r.status}</Badge>
              </div>
            </Card>
          ))}
        </div>

        {active ? (
          <Card className="p-4 space-y-4">
            <div>
              <h2 className="text-xl font-bold">{active.legal_name} <span className="text-sm font-normal text-muted-foreground">— @{active.profiles?.username}</span></h2>
              <p className="text-sm text-muted-foreground">{active.category} · plan: {active.plan} · {new Date(active.created_at).toLocaleString()}</p>
            </div>
            {active.brand_name && <div><span className="text-xs text-muted-foreground">Brand: </span>{active.brand_name}</div>}
            {active.website_url && <div><a href={active.website_url} target="_blank" rel="noreferrer" className="text-primary underline text-sm">{active.website_url}</a></div>}
            <div className="text-sm grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">External followers:</span> {active.follower_count?.toLocaleString() ?? "—"}</div>
              <div><span className="text-muted-foreground">On-platform:</span> {active.profiles?.followers_count?.toLocaleString() ?? 0}</div>
            </div>
            <div className="bg-muted/40 rounded p-3 text-sm whitespace-pre-wrap">{active.reason}</div>

            <div className="grid grid-cols-3 gap-2">
              {[["ID", docs.id], ["Selfie", docs.selfie], ["Business", docs.biz]].map(([label, url]) => (
                <a key={label as string} href={url as string || "#"} target="_blank" rel="noreferrer"
                  className={`flex flex-col items-center gap-1 border rounded p-2 text-xs ${url ? "hover:bg-muted/50" : "opacity-30 pointer-events-none"}`}>
                  <FileText className="h-5 w-5" />
                  <span>{label}</span>
                </a>
              ))}
            </div>

            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes (shown to user on reject / more-info)" rows={3} maxLength={500} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button onClick={() => decide("approved")} disabled={busy} className="bg-green-600 hover:bg-green-700">Approve</Button>
              <Button onClick={() => decide("more_info_required")} disabled={busy} variant="outline">More info</Button>
              <Button onClick={() => decide("rejected")} disabled={busy} variant="destructive">Reject</Button>
              {active.status === "approved" && <Button onClick={() => decide("revoked")} disabled={busy} variant="destructive">Revoke</Button>}
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center text-muted-foreground">Select a request to review.</Card>
        )}
      </div>
    </div>
  );
}
