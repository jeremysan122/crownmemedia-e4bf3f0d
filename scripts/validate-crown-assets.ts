import { spawnSync } from "node:child_process";
import path from "node:path";

const baseDir = process.argv[2];
const count = process.argv[3] ?? "100";

if (!baseDir) {
  console.error("Usage: bun scripts/validate-crown-assets.ts <base-dir> [count]");
  process.exit(1);
}

const pythonScript = String.raw`
import json
import hashlib
import sys
from pathlib import Path
from PIL import Image, UnidentifiedImageError

base_dir = Path(sys.argv[1])
count = int(sys.argv[2])

specs = [
    ("master", "masters", 2048, 2048, "png", 120000),
    ("gallery", "gallery", 768, 768, "webp", 12000),
    ("wearable", "wearable", 1024, 1024, "webp", 18000),
    ("thumbnail", "thumbnails", 256, 256, "webp", 4000),
]

rows = []
hashes = {}
failed = False

for n in range(1, count + 1):
    crown = f"{n:03d}"
    for key, directory, exp_w, exp_h, ext, min_bytes in specs:
        suffix = "thumb" if key == "thumbnail" else key
        filename = f"crown-{crown}-{suffix}.{ext}"
        file_path = base_dir / directory / filename
        issues = []
        try:
            size_bytes = file_path.stat().st_size
            if size_bytes < min_bytes:
                issues.append(f"file too small ({size_bytes} bytes)")

            with Image.open(file_path) as im:
                rgba = im.convert("RGBA")
                width, height = rgba.size
                alpha = rgba.getchannel("A")
                bbox = alpha.getbbox()
                alpha_min, alpha_max = alpha.getextrema()
                alpha_present = alpha_min < 255

                transparent_corners = True
                corner_rgbs = []
                for x, y in [
                    (0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1),
                    (8, 8), (width - 9, 8), (8, height - 9), (width - 9, height - 9),
                ]:
                    px = rgba.getpixel((x, y))
                    if px[3] > 0:
                        transparent_corners = False
                        corner_rgbs.append(px[:3])

                checkerboard_like = False
                if corner_rgbs:
                    unique = {tuple(rgb) for rgb in corner_rgbs}
                    if len(unique) <= 4:
                        checkerboard_like = True

                if width != exp_w or height != exp_h:
                    issues.append(f"expected {exp_w}x{exp_h}, got {width}x{height}")
                if not alpha_present:
                    issues.append("missing alpha transparency")
                if not transparent_corners:
                    issues.append("opaque corner pixels")
                if checkerboard_like:
                    issues.append("checkerboard-like corner pattern")
                if bbox is None:
                    issues.append("empty artwork")

                occupied_width_pct = 0
                occupied_height_pct = 0
                padding_pct = None
                bbox_json = None
                if bbox is not None:
                    left, top, right, bottom = bbox
                    bbox_width = right - left
                    bbox_height = bottom - top
                    bbox_json = {
                        "left": left,
                        "top": top,
                        "right": right,
                        "bottom": bottom,
                        "width": bbox_width,
                        "height": bbox_height,
                    }
                    occupied_width_pct = round((bbox_width / width) * 100, 2)
                    occupied_height_pct = round((bbox_height / height) * 100, 2)
                    padding_pct = {
                        "left": round((left / width) * 100, 2),
                        "right": round(((width - right) / width) * 100, 2),
                        "top": round((top / height) * 100, 2),
                        "bottom": round(((height - bottom) / height) * 100, 2),
                    }
                    if occupied_width_pct < 45:
                        issues.append(f"artwork too narrow ({occupied_width_pct}%)")
                    if key == "wearable" and padding_pct["bottom"] > 10:
                        issues.append(f"wearable bottom padding too large ({padding_pct['bottom']}%)")

                file_hash = hashlib.sha256(file_path.read_bytes()).hexdigest()
                hashes.setdefault(file_hash, []).append(f"{crown}:{key}")

                rows.append({
                    "crown": crown,
                    "variant": key,
                    "filename": filename,
                    "width": width,
                    "height": height,
                    "format": im.format.lower(),
                    "fileSize": size_bytes,
                    "alphaPresent": alpha_present,
                    "transparentCorners": transparent_corners,
                    "bbox": bbox_json,
                    "occupiedWidthPct": occupied_width_pct,
                    "occupiedHeightPct": occupied_height_pct,
                    "paddingPct": padding_pct,
                    "hash": file_hash,
                    "checkerboardLike": checkerboard_like,
                    "issues": issues,
                })
                if issues:
                    failed = True
        except (FileNotFoundError, UnidentifiedImageError, OSError) as error:
            rows.append({
                "crown": crown,
                "variant": key,
                "filename": filename,
                "width": 0,
                "height": 0,
                "format": ext,
                "fileSize": 0,
                "alphaPresent": False,
                "transparentCorners": False,
                "bbox": None,
                "occupiedWidthPct": 0,
                "occupiedHeightPct": 0,
                "paddingPct": None,
                "hash": "",
                "checkerboardLike": False,
                "issues": [f"missing or unreadable file: {error}"],
            })
            failed = True

for file_hash, refs in hashes.items():
    if len(refs) > 1:
        failed = True
        rows.append({
            "crown": "dup",
            "variant": "master",
            "filename": file_hash,
            "width": 0,
            "height": 0,
            "format": "hash",
            "fileSize": 0,
            "alphaPresent": True,
            "transparentCorners": True,
            "bbox": None,
            "occupiedWidthPct": 0,
            "occupiedHeightPct": 0,
            "paddingPct": None,
            "hash": file_hash,
            "checkerboardLike": False,
            "issues": [f"duplicate hash across assets: {', '.join(refs)}"],
        })

print(json.dumps({
    "baseDir": str(base_dir),
    "count": count,
    "passed": not failed,
    "rows": rows,
}, indent=2))
sys.exit(1 if failed else 0)
`;

const result = spawnSync("python3", ["-c", pythonScript, path.resolve(baseDir), count], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
