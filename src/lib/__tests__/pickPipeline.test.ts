import { describe, it, expect, vi } from "vitest";
import { runPickPipeline, type PickItem, type PickPipelineDeps } from "../pickPipeline";

function makeFile(name: string, opts: { type?: string; size?: number } = {}): File {
  const type = opts.type ?? "image/jpeg";
  const size = opts.size ?? 1024;
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

function makeDeps(over: Partial<PickPipelineDeps> = {}): PickPipelineDeps {
  return {
    isHeic: (f) => /\.heic$/i.test(f.name),
    convertHeicToJpeg: async (f) =>
      new File([new Uint8Array(10)], f.name.replace(/\.heic$/i, ".jpg"), { type: "image/jpeg" }),
    probeImage: async () => ({ width: 100, height: 100 }),
    sha256File: async (f) => `hash-${f.name}-${f.size}`,
    maxBytes: 8 * 1024 * 1024,
    maxDim: 6000,
    ...over,
  };
}

describe("runPickPipeline", () => {
  it("converts a HEIC file and emits per-file progress including a converting status", async () => {
    const heic = makeFile("photo.heic", { type: "image/heic" });
    const snapshots: PickItem[][] = [];
    const result = await runPickPipeline({
      files: [heic],
      existingHashes: new Set(),
      isCancelled: () => false,
      onProgress: (items) => snapshots.push(items),
      deps: makeDeps(),
    });
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].name).toBe("photo.jpg");
    expect(result.items[0].status).toBe("done");
    const statuses = snapshots.flatMap((s) => s.map((i) => i.status));
    expect(statuses).toContain("converting");
    expect(statuses).toContain("validating");
    expect(statuses).toContain("done");
    // Each snapshot references the original filename so the UI can show it.
    expect(snapshots[0][0].name).toBe("photo.heic");
  });

  it("marks the file failed when HEIC conversion throws and continues with the next file", async () => {
    const heic = makeFile("bad.heic", { type: "image/heic" });
    const jpg = makeFile("ok.jpg");
    const convertHeicToJpeg = vi.fn(async () => { throw new Error("decoder crashed"); });
    const snapshots: PickItem[][] = [];
    const result = await runPickPipeline({
      files: [heic, jpg],
      existingHashes: new Set(),
      isCancelled: () => false,
      onProgress: (items) => snapshots.push(items),
      deps: makeDeps({ convertHeicToJpeg }),
    });
    expect(convertHeicToJpeg).toHaveBeenCalledOnce();
    expect(result.items[0].status).toBe("failed");
    expect(result.items[0].error).toMatch(/HEIC/);
    expect(result.items[1].status).toBe("done");
    expect(result.valid.map((f) => f.name)).toEqual(["ok.jpg"]);
    expect(result.cancelled).toBe(false);
    // The final snapshot should preserve the failed entry for the UI.
    const last = snapshots.at(-1)!;
    expect(last[0].status).toBe("failed");
  });

  it("cancels remaining files when isCancelled flips mid-run", async () => {
    const files = [
      makeFile("a.heic", { type: "image/heic" }),
      makeFile("b.heic", { type: "image/heic" }),
      makeFile("c.heic", { type: "image/heic" }),
    ];
    let processed = 0;
    const cancel = { now: false };
    const deps = makeDeps({
      convertHeicToJpeg: async (f) => {
        processed++;
        if (processed === 2) cancel.now = true; // cancel after second conversion starts processing
        return new File([new Uint8Array(5)], f.name.replace(/\.heic$/i, ".jpg"), { type: "image/jpeg" });
      },
    });
    const result = await runPickPipeline({
      files,
      existingHashes: new Set(),
      isCancelled: () => cancel.now,
      onProgress: () => {},
      deps,
    });
    expect(result.cancelled).toBe(true);
    expect(result.items[0].status).toBe("done");
    expect(result.items[1].status).toBe("cancelled");
    expect(result.items[2].status).toBe("cancelled");
    expect(result.valid.map((f) => f.name)).toEqual(["a.jpg"]);
  });

  it("rejects oversized files with a failed status", async () => {
    const big = makeFile("huge.jpg", { size: 9 * 1024 * 1024 });
    const result = await runPickPipeline({
      files: [big],
      existingHashes: new Set(),
      isCancelled: () => false,
      onProgress: () => {},
      deps: makeDeps(),
    });
    expect(result.items[0].status).toBe("failed");
    expect(result.items[0].error).toMatch(/exceeds/);
    expect(result.valid).toHaveLength(0);
  });

  it("times out a decoder that never settles instead of leaving the picker blocked", async () => {
    const file = makeFile("stuck.png", { type: "image/png" });
    const result = await runPickPipeline({
      files: [file],
      existingHashes: new Set(),
      isCancelled: () => false,
      onProgress: () => {},
      deps: makeDeps({ probeImage: () => new Promise(() => {}) }),
      stepTimeoutMs: 5,
    });

    expect(result.items[0]).toMatchObject({
      status: "failed",
      error: "stuck.png took too long to decode. Try a different photo.",
    });
    expect(result.valid).toHaveLength(0);
  });

  it("lets Cancel interrupt a decoder that never settles", async () => {
    const file = makeFile("stuck.png", { type: "image/png" });
    let cancelled = false;
    setTimeout(() => { cancelled = true; }, 5);

    const result = await runPickPipeline({
      files: [file],
      existingHashes: new Set(),
      isCancelled: () => cancelled,
      onProgress: () => {},
      deps: makeDeps({ probeImage: () => new Promise(() => {}) }),
      stepTimeoutMs: 1_000,
    });

    expect(result.cancelled).toBe(true);
    expect(result.items[0].status).toBe("cancelled");
  });
});
