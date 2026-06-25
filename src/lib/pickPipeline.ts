/**
 * Pure pick-pipeline used by the Upload page.
 *
 * Extracted so we can unit-test HEIC conversion success/failure, cancel
 * behavior, and per-file progress reporting without rendering React.
 *
 * Each input file walks through: pending → converting (HEIC only) →
 * validating → done | failed | cancelled. The caller passes an `isCancelled`
 * predicate (typically backed by a ref) so the user can abort the run
 * mid-flight; any files not yet processed are marked `cancelled` and the
 * already-processed `done` files are still returned so the caller can decide
 * whether to surface them.
 */

export type PickItemStatus =
  | "pending"
  | "converting"
  | "validating"
  | "done"
  | "failed"
  | "cancelled";

export interface PickItem {
  name: string;
  status: PickItemStatus;
  /** Human-readable error when status === "failed". */
  error?: string;
}

export interface PickPipelineDeps {
  isHeic: (file: File) => boolean;
  convertHeicToJpeg: (file: File) => Promise<File>;
  probeImage: (file: File) => Promise<{ width: number; height: number }>;
  sha256File: (file: File) => Promise<string>;
  maxBytes: number;
  maxDim: number;
}

export interface PickPipelineOptions {
  files: File[];
  existingHashes: Set<string>;
  isCancelled: () => boolean;
  onProgress: (items: PickItem[]) => void;
  deps: PickPipelineDeps;
}

export interface PickPipelineResult {
  /** Files that passed every check, in input order. */
  valid: File[];
  /** Final per-file status list, parallel to options.files. */
  items: PickItem[];
  /** True when isCancelled() returned true before all files were processed. */
  cancelled: boolean;
}

export async function runPickPipeline(
  opts: PickPipelineOptions,
): Promise<PickPipelineResult> {
  const { files, existingHashes, isCancelled, onProgress, deps } = opts;
  const items: PickItem[] = files.map((f) => ({ name: f.name, status: "pending" }));
  const valid: File[] = [];
  const seen = new Set(existingHashes);
  let cancelled = false;

  const emit = () => onProgress(items.map((it) => ({ ...it })));
  emit();

  for (let i = 0; i < files.length; i++) {
    if (isCancelled()) {
      cancelled = true;
      for (let j = i; j < items.length; j++) {
        if (items[j].status === "pending") items[j].status = "cancelled";
      }
      emit();
      return { valid, items, cancelled };
    }

    const raw = files[i];
    let f = raw;

    if (deps.isHeic(f)) {
      items[i].status = "converting";
      emit();
      try {
        f = await deps.convertHeicToJpeg(f);
      } catch (err) {
        items[i].status = "failed";
        items[i].error =
          err instanceof Error
            ? `Couldn't convert ${raw.name} from HEIC. ${err.message}`
            : `Couldn't convert ${raw.name} from HEIC.`;
        emit();
        continue;
      }
    }

    if (isCancelled()) {
      cancelled = true;
      items[i].status = "cancelled";
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].status === "pending") items[j].status = "cancelled";
      }
      emit();
      return { valid, items, cancelled };
    }

    items[i].status = "validating";
    emit();

    if (!f.type.startsWith("image/")) {
      items[i].status = "failed";
      items[i].error = `${f.name} isn't a supported image.`;
      emit();
      continue;
    }
    if (f.size > deps.maxBytes) {
      items[i].status = "failed";
      items[i].error = `${f.name} exceeds ${(deps.maxBytes / 1024 / 1024).toFixed(0)}MB.`;
      emit();
      continue;
    }

    try {
      const dims = await deps.probeImage(f);
      if (dims.width > deps.maxDim || dims.height > deps.maxDim) {
        items[i].status = "failed";
        items[i].error = `${f.name} is too large (${dims.width}×${dims.height}).`;
        emit();
        continue;
      }
      const hash = await deps.sha256File(f);
      if (seen.has(hash)) {
        items[i].status = "failed";
        items[i].error = `${f.name} is already added.`;
        emit();
        continue;
      }
      seen.add(hash);
      valid.push(f);
      items[i].status = "done";
      emit();
    } catch {
      items[i].status = "failed";
      items[i].error = `Couldn't read ${f.name}.`;
      emit();
    }
  }

  return { valid, items, cancelled };
}
