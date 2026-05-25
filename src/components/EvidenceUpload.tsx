import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Paperclip, X, Loader2, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const MAX_FILES = 3;
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4";
const ACCEPT_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4"];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

type UploadStatus = "uploading" | "done" | "error" | "canceled";

interface UploadItem {
  id: string;
  file: File;
  path: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  xhr?: XMLHttpRequest;
}

interface Props {
  userId: string;
  /** Folder under userId/ — typically "reports" or "appeals" */
  kind: "reports" | "appeals";
  /** Persisted storage paths already uploaded successfully. */
  paths: string[];
  onChange: (paths: string[]) => void;
  disabled?: boolean;
}

/**
 * Uploads evidence files to the private `evidence` bucket under
 * `<userId>/<kind>/<random>-<filename>` using XHR for progress + abort.
 * Files in `paths` are persisted; in-flight items live in local state until done.
 */
export default function EvidenceUpload({ userId, kind, paths, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);

  // Ref keeps the latest paths prop visible inside XHR onload closures
  // so that concurrent uploads don't clobber each other's completed paths.
  const pathsRef = useRef(paths);

  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);

  const [confirm, setConfirm] = useState<
    | { kind: "pending"; id: string; name: string }
    | { kind: "persisted"; path: string; name: string }
    | null
  >(null);

  const totalCount = paths.length + items.filter((i) => i.status === "uploading").length;

  const validate = (file: File): string | null => {
    if (!ACCEPT_TYPES.includes(file.type)) return "Unsupported file type";
    if (file.size > MAX_BYTES) return "Exceeds 25MB";
    return null;
  };

  const startUpload = async (file: File): Promise<UploadItem> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${userId}/${kind}/${crypto.randomUUID()}-${safeName}`;
    const itemId = crypto.randomUUID();

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      const errItem: UploadItem = {
        id: itemId,
        file,
        path,
        status: "error",
        progress: 0,
        error: "Not signed in",
      };

      return errItem;
    }

    const xhr = new XMLHttpRequest();

    const item: UploadItem = {
      id: itemId,
      file,
      path,
      status: "uploading",
      progress: 0,
      xhr,
    };

    const url = `${SUPABASE_URL}/storage/v1/object/evidence/${encodeURI(path)}`;

    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("Cache-Control", "3600");

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;

      const pct = Math.round((e.loaded / e.total) * 100);

      setItems((prev) =>
        prev.map((p) => (p.id === itemId ? { ...p, progress: pct } : p)),
      );
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setItems((prev) =>
          prev.map((p) =>
            p.id === itemId ? { ...p, status: "done", progress: 100 } : p,
          ),
        );

        // Promote into persisted paths — use ref to get current value, not stale closure.
        onChange([...pathsRef.current, path]);
      } else {
        let msg = `Upload failed (${xhr.status})`;

        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.message) msg = body.message;
        } catch {
          /* noop */
        }

        setItems((prev) =>
          prev.map((p) =>
            p.id === itemId ? { ...p, status: "error", error: msg } : p,
          ),
        );
      }
    };

    xhr.onerror = () => {
      setItems((prev) =>
        prev.map((p) =>
          p.id === itemId ? { ...p, status: "error", error: "Network error" } : p,
        ),
      );
    };

    xhr.onabort = () => {
      setItems((prev) =>
        prev.map((p) => (p.id === itemId ? { ...p, status: "canceled" } : p)),
      );
    };

    xhr.send(file);

    return item;
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;

    const remaining = MAX_FILES - totalCount;

    if (remaining <= 0) {
      toast.error(`Max ${MAX_FILES} files`);
      return;
    }

    const files = Array.from(fileList).slice(0, remaining);

    if (files.length < fileList.length) {
      toast.warning(`Only first ${remaining} added`);
    }

    for (const file of files) {
      const v = validate(file);

      if (v) {
        toast.error(`${file.name}: ${v}`);
        continue;
      }

      const item = await startUpload(file);
      setItems((prev) => [...prev, item]);
    }

    if (inputRef.current) inputRef.current.value = "";
  };

  const cancel = (id: string) => {
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      it?.xhr?.abort();
      return prev;
    });
  };

  const retry = async (id: string) => {
    const target = items.find((i) => i.id === id);

    if (!target) return;

    setItems((prev) => prev.filter((p) => p.id !== id));

    const fresh = await startUpload(target.file);

    setItems((prev) => [...prev, fresh]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  const removePersisted = async (path: string) => {
    onChange(paths.filter((p) => p !== path));

    // Best-effort cleanup; RLS allows owner delete in own folder.
    await supabase.storage.from("evidence").remove([path]).catch(() => {});
  };

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Paperclip size={12} /> Evidence (optional)
      </Label>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || totalCount >= MAX_FILES}
        >
          <Paperclip size={12} className="mr-1" /> Add file
        </Button>

        <span className="text-[10px] text-muted-foreground">
          {totalCount}/{MAX_FILES} · jpg/png/webp/mp4 · 25MB max
        </span>
      </div>

      {/* In-flight uploads */}
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="bg-muted/40 rounded px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                {it.status === "uploading" && (
                  <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                )}

                {it.status === "done" && (
                  <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                )}

                {it.status === "error" && (
                  <AlertCircle size={12} className="text-destructive shrink-0" />
                )}

                {it.status === "canceled" && (
                  <X size={12} className="text-muted-foreground shrink-0" />
                )}

                <span className="truncate flex-1">{it.file.name}</span>

                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {fmtSize(it.file.size)}
                </span>

                {it.status === "uploading" && (
                  <button
                    type="button"
                    onClick={() => cancel(it.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Cancel upload"
                  >
                    <X size={12} />
                  </button>
                )}

                {(it.status === "error" || it.status === "canceled") && (
                  <>
                    <button
                      type="button"
                      onClick={() => retry(it.id)}
                      className="text-primary hover:underline text-[11px] inline-flex items-center gap-0.5"
                      aria-label="Retry upload"
                    >
                      <RotateCcw size={10} /> Retry
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          kind: "pending",
                          id: it.id,
                          name: it.file.name,
                        })
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>

              {it.status === "uploading" && <Progress value={it.progress} className="h-1" />}

              {it.status === "error" && it.error && (
                <p className="text-[10px] text-destructive pl-4">{it.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Persisted uploaded files — with in-dialog remove */}
      {paths.length > 0 && (
        <ul className="space-y-1">
          {paths.map((p) => {
            const name = p.split("/").pop() ?? p;

            return (
              <li
                key={p}
                className="flex items-center gap-2 text-xs bg-muted/40 rounded px-2 py-1"
              >
                <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />

                <span className="truncate flex-1">{name}</span>

                <button
                  type="button"
                  onClick={() =>
                    setConfirm({
                      kind: "persisted",
                      path: p,
                      name,
                    })
                  }
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove file"
                  disabled={disabled}
                >
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[10px] text-muted-foreground">
        Files are stored privately and visible only to you and our moderators.
      </p>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this evidence file?</AlertDialogTitle>

            <AlertDialogDescription>
              {confirm?.kind === "persisted"
                ? `"${confirm.name}" will be deleted from secure storage and removed from this submission. This cannot be undone.`
                : `"${confirm?.name}" will be removed from this submission.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>

            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;

                if (confirm.kind === "pending") {
                  removeItem(confirm.id);
                } else {
                  removePersisted(confirm.path);
                }

                setConfirm(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
