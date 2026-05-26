import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";

export default function AdminBroadcast() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [activeDays, setActiveDays] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);

  const send = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!confirm(`Broadcast "${title}" to ${activeDays ? `users active in last ${activeDays} days` : "ALL users"}?`)) return;
    setSending(true);
    const { data, error } = await supabase.rpc("admin_broadcast_notification", {
      _title: title.trim(),
      _body: body.trim() || null,
      _link: link.trim() || null,
      _only_active_days: activeDays ? Number(activeDays) : null,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const count = (data as number) ?? 0;
    setLastSent(count);
    toast.success(`Broadcast sent to ${count} user${count === 1 ? "" : "s"}`);
    setTitle(""); setBody(""); setLink("");
  };

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-serif font-bold">Broadcast Notification</h1>
          <p className="text-sm text-muted-foreground">Push a system notification to every user (or a recent-activity segment).</p>
        </div>
      </header>

      <Card className="p-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="bc-title">Title *</Label>
          <Input id="bc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="👑 New season kickoff" maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bc-body">Body</Label>
          <Textarea id="bc-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Optional message body" rows={3} maxLength={500} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bc-link">Deep link (optional)</Label>
          <Input id="bc-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/rewards or /battles" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bc-active">Only users active in last (days)</Label>
          <Input
            id="bc-active"
            type="number"
            min={1}
            max={365}
            value={activeDays}
            onChange={(e) => setActiveDays(e.target.value)}
            placeholder="Leave empty to send to everyone"
          />
        </div>
        <Button onClick={send} disabled={sending || !title.trim()} className="w-full" size="lg">
          {sending ? "Sending…" : "Send broadcast"}
        </Button>
        {lastSent !== null && (
          <p className="text-sm text-center text-muted-foreground">Last broadcast reached {lastSent} user{lastSent === 1 ? "" : "s"}.</p>
        )}
      </Card>
    </div>
  );
}
