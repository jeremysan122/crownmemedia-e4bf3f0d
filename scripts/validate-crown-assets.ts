import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

interface VariantSpec {
  key: "master" | "gallery" | "wearable" | "thumbnail";
  dir: string;
  width: number;
  height: number;
  ext: string;
  minBytes: number;
}

interface ValidationRow {
  crown: string;
  variant: VariantSpec["key"];
  filename: string;
  width: number;
  height: number;
  format: string;
  fileSize: number;
  alphaPresent: boolean;
  transparentCorners: boolean;
  bbox: { left: number; top: number; right: number; bottom: number; width: number; height: number } | null;
  occupiedWidthPct: number;
  occupiedHeightPct: number;
  paddingPct: { left: number; right: number; top: number; bottom: number } | null;
  hash: string;
  checkerboardLike: boolean;
  issues: string[];
}

const specs: VariantSpec[] = [
  { key: "master", dir: "masters", width: 2048, height: 2048, ext: "png", minBytes: 120_000 },
  { key: "gallery", dir: "gallery", width: 768, height: 768, ext: "webp", minBytes: 12_000 },
  { key: "wearable", dir: "wearable", width: 1024, height: 1024, ext: "webp", minBytes: 18_000 },
  { key: "thumbnail", dir: "thumbnails", width: 256, height: 256, ext: "webp", minBytes: 4_000 },
];

function usage() {
  console.error("Usage: node scripts/validate-crown-assets.ts <base-dir> [count]");
  process.exit(1);
}

async function loadImageData(filePath: string): Promise<{ width: number; height: number; format: string; rgba: Uint8Array }> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") {
    const { default: pngjs } = await import("pngjs");
    const buf = await fs.readFile(filePath);
    const png = pngjs.PNG.sync.read(buf);
    return { width: png.width, height: png.height, format: "png", rgba: png.data };
  }

  const { Image } = await import("canvas");
  const src = await fs.readFile(filePath);
  const image = new Image();
  image.src = src;
  const { createCanvas } = await import("canvas");
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  return { width: image.width, height: image.height, format: ext.replace(".", ""), rgba: new Uint8Array(data.buffer.slice(0)) };
}

function analyzePixels(width: number, height: number, rgba: Uint8Array) {
  let alphaPresent = false;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const alphaValues = new Set<number>();
  const rgbCornerSamples: number[][] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const a = rgba[idx + 3];
      alphaValues.add(a);
      if (a < 255) alphaPresent = true;
      if (a > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      const isCorner = (x < 12 && y < 12) || (x >= width - 12 && y < 12) || (x < 12 && y >= height - 12) || (x >= width - 12 && y >= height - 12);
      if (isCorner && a > 0) rgbCornerSamples.push([r, g, b, a]);
    }
  }

  const bbox = maxX >= 0
    ? { left: minX, top: minY, right: maxX, bottom: maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;

  const transparentCorners = rgbCornerSamples.length === 0;
  const checkerboardLike = rgbCornerSamples.length > 20 && new Set(rgbCornerSamples.map((s) => `${s[0]},${s[1]},${s[2]}`)).size <= 4;

  return { alphaPresent, alphaValues, bbox, transparentCorners, checkerboardLike };
}

async function main() {
  const baseDir = process.argv[2];
  const count = Number(process.argv[3] ?? "100");
  if (!baseDir) usage();

  const rows: ValidationRow[] = [];
  const hashes = new Map<string, string[]>();
  let hasFailure = false;

  for (let n = 1; n <= count; n += 1) {
    const crown = `${n}`.padStart(3, "0");
    for (const spec of specs) {
      const filename = `crown-${crown}-${spec.key === "thumbnail" ? "thumb" : spec.key}.${spec.ext}`;
      const filePath = path.join(baseDir, spec.dir, filename);
      const issues: string[] = [];
      try {
        const stat = await fs.stat(filePath);
        const fileSize = stat.size;
        if (fileSize < spec.minBytes) issues.push(`file too small (${fileSize} bytes)`);

        const buffer = await fs.readFile(filePath);
        const hash = crypto.createHash("sha256").update(buffer).digest("hex");
        const data = await loadImageData(filePath);
        const analysis = analyzePixels(data.width, data.height, data.rgba);

        if (data.width !== spec.width || data.height !== spec.height) {
          issues.push(`expected ${spec.width}x${spec.height}, got ${data.width}x${data.height}`);
        }
        if (!analysis.alphaPresent) issues.push("missing alpha transparency");
        if (!analysis.transparentCorners) issues.push("opaque corner pixels");
        if (analysis.checkerboardLike) issues.push("checkerboard-like corner pattern");
        if (!analysis.bbox) issues.push("empty artwork");

        let occupiedWidthPct = 0;
        let occupiedHeightPct = 0;
        let paddingPct: ValidationRow["paddingPct"] = null;
        if (analysis.bbox) {
          occupiedWidthPct = Number(((analysis.bbox.width / data.width) * 100).toFixed(2));
          occupiedHeightPct = Number(((analysis.bbox.height / data.height) * 100).toFixed(2));
          paddingPct = {
            left: Number(((analysis.bbox.left / data.width) * 100).toFixed(2)),
            right: Number((((data.width - 1 - analysis.bbox.right) / data.width) * 100).toFixed(2)),
            top: Number(((analysis.bbox.top / data.height) * 100).toFixed(2)),
            bottom: Number((((data.height - 1 - analysis.bbox.bottom) / data.height) * 100).toFixed(2)),
          };
          if (occupiedWidthPct < 45) issues.push(`artwork too narrow (${occupiedWidthPct}%)`);
          if (spec.key === "wearable" && paddingPct.bottom > 10) issues.push(`wearable bottom padding too large (${paddingPct.bottom}%)`);
        }

        const row: ValidationRow = {
          crown,
          variant: spec.key,
          filename,
          width: data.width,
          height: data.height,
          format: data.format,
          fileSize,
          alphaPresent: analysis.alphaPresent,
          transparentCorners: analysis.transparentCorners,
          bbox: analysis.bbox,
          occupiedWidthPct,
          occupiedHeightPct,
          paddingPct,
          hash,
          checkerboardLike: analysis.checkerboardLike,
          issues,
        };
        rows.push(row);
        const dupes = hashes.get(hash) ?? [];
        dupes.push(`${crown}:${spec.key}`);
        hashes.set(hash, dupes);
        if (issues.length > 0) hasFailure = true;
      } catch (error) {
        rows.push({
          crown,
          variant: spec.key,
          filename,
          width: 0,
          height: 0,
          format: spec.ext.replace(".", ""),
          fileSize: 0,
          alphaPresent: false,
          transparentCorners: false,
          bbox: null,
          occupiedWidthPct: 0,
          occupiedHeightPct: 0,
          paddingPct: null,
          hash: "",
          checkerboardLike: false,
          issues: [`missing or unreadable file: ${(error as Error).message}`],
        });
        hasFailure = true;
      }
    }
  }

  const duplicateGroups = Array.from(hashes.entries()).filter(([, refs]) => refs.length > 1);
  if (duplicateGroups.length > 0) {
    hasFailure = true;
    for (const [hash, refs] of duplicateGroups) {
      rows.push({
        crown: "dup",
        variant: "master",
        filename: hash,
        width: 0,
        height: 0,
        format: "hash",
        fileSize: 0,
        alphaPresent: true,
        transparentCorners: true,
        bbox: null,
        occupiedWidthPct: 0,
        occupiedHeightPct: 0,
        paddingPct: null,
        hash,
        checkerboardLike: false,
        issues: [`duplicate hash across assets: ${refs.join(", ")}`],
      });
    }
  }

  const report = {
    baseDir,
    count,
    passed: !hasFailure,
    rows,
  };

  console.log(JSON.stringify(report, null, 2));
  if (hasFailure) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
