import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState } from "@/components/admin/cc/CommandCenterUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { setPlatformSetting } from "@/lib/admin";
import { toast } from "sonner";

export default function CommandCenterSettings() {
  const [rows, setRows] = useState<any[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");

  const load = async () => {
    const { data } = await supabase.from("platform_settings").select("*").order("key");
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!key.trim()) { toast.error("Key required."); return; }
    let parsed: unknown = value;
    try { parsed = JSON.parse(value); } catch { /* leave as raw string */ }
    try {
      await setPlatformSetting(key.trim(), parsed, desc.trim() || undefined);
      toast.success("Saved"); setKey(""); setValue(""); setDesc("");
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  return (
    <div className="space-y-3">
      <SectionCard title="Set Platform Setting">
        <div className="space-y-2">
          <Input value={key} onChange={(e)=>setKey(e.target.value)} placeholder="Key (e.g. feature.crown_battles_enabled)" className="h-8 text-xs font-mono" />
          <Textarea value={value} onChange={(e)=>setValue(e.target.value)} placeholder='Value (JSON or string), e.g. true, 42, "hello", {"a":1}' rows={3} className="text-xs font-mono" />
          <Input value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="Description (optional)" className="h-8 text-xs" />
          <Button size="sm" className="h-8" onClick={save}>Save / Upsert</Button>
        </div>
      </SectionCard>

      <SectionCard title={`Active Settings (${rows.length})`}>
        {rows.length === 0 ? <EmptyState message="No settings configured yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left py-1.5">Key</th><th className="text-left">Value</th><th className="text-left">Updated</th></tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-1.5 font-mono">{r.key}</td>
                    <td className="font-mono text-muted-foreground truncate max-w-[40vw]">{JSON.stringify(r.value)}</td>
                    <td className="text-[10px] text-muted-foreground">{new Date(r.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
