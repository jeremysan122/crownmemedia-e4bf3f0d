#!/usr/bin/env python3
"""
CrownMe v2 asset pipeline — generates ONE crown at a time end-to-end:

  1. Calls Lovable AI Gateway `openai/gpt-image-2` at 2048x2048 with
     background: "transparent" (single non-streaming JSON response).
  2. Decodes the base64 PNG and validates: 2048x2048, RGBA, alpha channel,
     transparent corners (opaque fallback -> reject).
  3. Derives 768 gallery WebP, 1024 wearable WebP (tight bottom-aligned crop),
     and 256 thumb WebP with PIL LANCZOS from the master.
  4. Writes all four to /tmp/crowns_v2/<slug>/ for pickup by the uploader.

Usage:
  LOVABLE_API_KEY=... python3 scripts/generate_crowns_v2.py <slug> <collection> <tier>
  python3 scripts/generate_crowns_v2.py crown-001 origin 1
"""
from __future__ import annotations
import base64, io, json, os, sys, hashlib, time
from pathlib import Path

import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from crown_prompts import build_prompt  # type: ignore

OUT_ROOT = Path("/tmp/crowns_v2")
MASTER_SIZE = 2048
GALLERY_SIZE = 768
WEARABLE_SIZE = 1024
THUMB_SIZE = 256

GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/images/generations"
MODEL = "openai/gpt-image-2"

def call_gpt_image(prompt: str, api_key: str) -> bytes:
    body = {
        "model": MODEL,
        "prompt": prompt,
        "size": "2048x2048",
        "background": "transparent",
        "quality": "high",
        "n": 1,
        # non-streaming: single JSON body with data[0].b64_json
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    resp = requests.post(GATEWAY_URL, headers=headers, json=body, timeout=300)
    if resp.status_code != 200:
        raise SystemExit(f"gateway {resp.status_code}: {resp.text[:600]}")
    payload = resp.json()
    b64 = payload["data"][0]["b64_json"]
    return base64.b64decode(b64)

def validate_master(img: Image.Image) -> None:
    if img.size != (MASTER_SIZE, MASTER_SIZE):
        raise SystemExit(f"master size {img.size} != {MASTER_SIZE}x{MASTER_SIZE}")
    if img.mode != "RGBA":
        raise SystemExit(f"master mode {img.mode} != RGBA")
    # corner transparency probe
    corners = [(0,0),(MASTER_SIZE-1,0),(0,MASTER_SIZE-1),(MASTER_SIZE-1,MASTER_SIZE-1)]
    for x,y in corners:
        a = img.getpixel((x,y))[3]
        if a >= 250:
            raise SystemExit(f"opaque corner at ({x},{y}) alpha={a} — background not transparent")
    # alpha histogram sanity
    alpha = img.split()[-1]
    hist = alpha.histogram()
    if hist[0] < (MASTER_SIZE * MASTER_SIZE * 0.05):
        raise SystemExit("less than 5% fully-transparent pixels — image likely has baked background")

def visible_bbox(img: Image.Image) -> tuple[int,int,int,int]:
    # bbox() on the alpha channel gives us tight artwork bounds.
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit("no visible artwork (all transparent)")
    return bbox

def make_wearable(master: Image.Image, out_path: Path) -> None:
    """
    Wearable = tightly cropped square, bottom-aligned to the crown's lower
    band, output at 1024x1024. This gives CrownAvatar predictable geometry.
    """
    l,t,r,b = visible_bbox(master)
    w = r - l
    h = b - t
    # pad ~6% on the horizontal sides, ~8% on top, minimal below
    pad_x = int(max(w,h) * 0.06)
    pad_top = int(max(w,h) * 0.08)
    pad_bot = int(max(w,h) * 0.02)
    side = max(w + 2*pad_x, h + pad_top + pad_bot)
    cx = (l + r) // 2
    # anchor the crop so the bottom of the artwork sits near the crop's bottom
    crop_bottom = min(MASTER_SIZE, b + pad_bot)
    crop_top = max(0, crop_bottom - side)
    crop_left = max(0, cx - side // 2)
    crop_right = min(MASTER_SIZE, crop_left + side)
    # keep square
    side_actual = min(crop_right - crop_left, crop_bottom - crop_top)
    crop_left = crop_right - side_actual
    crop_top = crop_bottom - side_actual
    tight = master.crop((crop_left, crop_top, crop_right, crop_bottom))
    tight = tight.resize((WEARABLE_SIZE, WEARABLE_SIZE), Image.Resampling.LANCZOS)
    tight.save(out_path, format="WEBP", quality=95, method=6)

def derive_variants(master: Image.Image, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    master_path = out_dir / "master.png"
    gallery_path = out_dir / "gallery.webp"
    wearable_path = out_dir / "wearable.webp"
    thumb_path = out_dir / "thumb.webp"

    master.save(master_path, format="PNG", optimize=True)

    gallery = master.resize((GALLERY_SIZE, GALLERY_SIZE), Image.Resampling.LANCZOS)
    gallery.save(gallery_path, format="WEBP", quality=95, method=6)

    thumb = master.resize((THUMB_SIZE, THUMB_SIZE), Image.Resampling.LANCZOS)
    thumb.save(thumb_path, format="WEBP", quality=90, method=6)

    make_wearable(master, wearable_path)

    def stat(p): return {"path": str(p), "bytes": p.stat().st_size}
    return {
        "master": stat(master_path),
        "gallery": stat(gallery_path),
        "wearable": stat(wearable_path),
        "thumbnail": stat(thumb_path),
        "sha256": hashlib.sha256(master_path.read_bytes()).hexdigest(),
    }

def parse_slug(slug: str) -> int:
    return int(slug.split("-")[1])

def main() -> None:
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    slug, collection, tier_s = sys.argv[1], sys.argv[2], sys.argv[3]
    tier = int(tier_s)
    crown_number = parse_slug(slug)

    api_key = os.environ.get("LOVABLE_API_KEY")
    if not api_key:
        raise SystemExit("LOVABLE_API_KEY missing")

    prompt = build_prompt(collection, tier, crown_number)
    out_dir = OUT_ROOT / slug

    t0 = time.time()
    print(f"[{slug}] generating (collection={collection} tier={tier}) ...", flush=True)
    png_bytes = call_gpt_image(prompt, api_key)
    img = Image.open(io.BytesIO(png_bytes))
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    validate_master(img)
    result = derive_variants(img, out_dir)
    result["slug"] = slug
    result["collection"] = collection
    result["tier_index"] = tier
    result["crown_number"] = crown_number
    result["prompt"] = prompt
    result["elapsed_sec"] = round(time.time() - t0, 2)

    manifest = out_dir / "manifest.json"
    manifest.write_text(json.dumps(result, indent=2))
    print(json.dumps({k: v for k, v in result.items() if k != "prompt"}, indent=2))

if __name__ == "__main__":
    main()
