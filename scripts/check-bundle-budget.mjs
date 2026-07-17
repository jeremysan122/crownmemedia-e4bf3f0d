import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const assetsDir = path.resolve("dist/assets");
const MAX_GZIP_BYTES = 550 * 1024;
const MAX_INITIAL_JS_GZIP_BYTES = 300 * 1024;

const files = (await readdir(assetsDir)).filter((file) => file.endsWith(".js"));
if (files.length === 0) throw new Error("No production JavaScript bundles found in dist/assets");

let failed = false;
for (const file of files) {
  const bytes = await readFile(path.join(assetsDir, file));
  const gzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
  const limit = file.startsWith("index-") ? MAX_INITIAL_JS_GZIP_BYTES : MAX_GZIP_BYTES;
  if (gzipBytes > limit) {
    failed = true;
    console.error(`${file}: ${(gzipBytes / 1024).toFixed(1)} KiB gzip exceeds ${(limit / 1024).toFixed(0)} KiB`);
  }
}

if (failed) process.exit(1);
console.log(`Bundle budget passed for ${files.length} JavaScript assets.`);
