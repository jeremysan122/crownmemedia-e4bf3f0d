import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { exportCsv, exportJson, tsStamp } from "@/lib/exportData";

export interface ExportSection {
  label: string;
  filename: string;
  rows: Record<string, unknown>[];
}

interface Props {
  /** Diagnostic name, e.g. "overview", "realtime", "security" */
  name: string;
  sections: ExportSection[];
}

/** Dropdown that lets admins download each diagnostic table as CSV
 *  or a single combined JSON bundle for sharing. */
export default function ExportDiagnosticsButton({ name, sections }: Props) {
  const stamp = tsStamp();
  const empty = sections.every((s) => !s.rows || s.rows.length === 0);

  const downloadAllJson = () => {
    const bundle: Record<string, unknown> = { exported_at: new Date().toISOString(), name };
    sections.forEach((s) => {
      bundle[s.filename] = s.rows ?? [];
    });
    exportJson(`crownme-${name}-${stamp}.json`, bundle);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px]" disabled={empty}>
          <Download size={12} /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
          Diagnostics — {name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sections.map((s) => (
          <DropdownMenuItem
            key={s.filename}
            disabled={!s.rows || s.rows.length === 0}
            onClick={() => exportCsv(`crownme-${name}-${s.filename}-${stamp}.csv`, s.rows)}
          >
            {s.label} <span className="ml-auto text-muted-foreground text-[10px]">.csv</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={downloadAllJson}>
          Full bundle <span className="ml-auto text-muted-foreground text-[10px]">.json</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
