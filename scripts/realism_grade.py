#!/usr/bin/env python3
"""Photographic post-grade to take the "AI" edge off existing images.

Keeps the same composition/pixels; only applies surface-level realism:
soften over-crisp micro-texture, re-sharpen naturally, filmic color grade,
desaturate the AI over-tint, gentle vignette, and film grain. Re-encodes
as a realistic JPEG. Does NOT add people or fix structural AI artifacts.

Usage:
  python3 scripts/realism_grade.py <outdir> <file> [<file> ...]

All intensity knobs live in the PRESET below so they can be tuned in one place.
"""

import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageDraw, ImageOps, ImageChops

# ---------------------------------------------------------------------------
# Intensity presets. Pick one via --intensity light|medium|strong.
# ---------------------------------------------------------------------------
PRESETS = {
    "light": {
        "soft_radius": 0.4, "sharp_radius": 1.0, "sharp_percent": 60, "sharp_threshold": 3,
        "saturation": 0.94, "contrast": 1.03, "brightness": 0.995,
        "filmic_strength": 0.22, "vignette_strength": 0.10, "grain_sigma": 7, "jpeg_quality": 92,
    },
    "medium": {
        "soft_radius": 0.5, "sharp_radius": 1.0, "sharp_percent": 70, "sharp_threshold": 3,
        "saturation": 0.90, "contrast": 1.05, "brightness": 0.99,
        "filmic_strength": 0.35, "vignette_strength": 0.18, "grain_sigma": 11, "jpeg_quality": 90,
    },
    "strong": {
        "soft_radius": 0.7, "sharp_radius": 1.1, "sharp_percent": 80, "sharp_threshold": 3,
        "saturation": 0.85, "contrast": 1.08, "brightness": 0.985,
        "filmic_strength": 0.45, "vignette_strength": 0.25, "grain_sigma": 16, "jpeg_quality": 88,
    },
}
PRESET = PRESETS["medium"]  # mutated by --intensity at runtime


def _filmic_curve(img, strength):
    """Blend toward an S-curve: deeper shadows, rolled-off highlights."""
    lut = []
    for i in range(256):
        x = i / 255.0
        # smoothstep-ish S-curve centered at midtone
        curved = x * x * (3 - 2 * x)
        lut.append(int(round((curved * 255) * strength + i * (1 - strength))))
    # PIL applies LUT per-channel on "L"; for RGB apply to each channel via split
    channels = img.split()
    graded = Image.merge("RGB", tuple(ch.point(lut) for ch in channels))
    return graded


def _vignette(img, strength):
    w, h = img.size
    overlay = Image.new("RGB", (w, h), (0, 0, 0))
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([-w * 0.25, -h * 0.25, w * 1.25, h * 1.25], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) * 0.22))
    darkened = Image.composite(img, overlay, ImageOps.invert(mask))
    return Image.blend(img, darkened, strength)


def _grain(img, sigma):
    if sigma <= 0:
        return img
    w, h = img.size
    # effect_noise -> L with ~gaussian distribution around 128
    noise = Image.effect_noise((w, h), sigma).convert("RGB")
    # overlay of neutral-gray noise = subtle film grain (identity at 128)
    return ImageChops.overlay(img, noise)


def grade_image(img):
    img = img.convert("RGB")
    # 1. kill the over-crisp AI micro-texture, then re-sharpen edges naturally
    img = img.filter(ImageFilter.GaussianBlur(radius=PRESET["soft_radius"]))
    img = img.filter(
        ImageFilter.UnsharpMask(
            radius=PRESET["sharp_radius"],
            percent=PRESET["sharp_percent"],
            threshold=PRESET["sharp_threshold"],
        )
    )
    # 2. color: desaturate the AI tint, gentle contrast/brightness
    img = ImageEnhance.Color(img).enhance(PRESET["saturation"])
    img = ImageEnhance.Contrast(img).enhance(PRESET["contrast"])
    img = ImageEnhance.Brightness(img).enhance(PRESET["brightness"])
    # 3. filmic tone curve
    img = _filmic_curve(img, PRESET["filmic_strength"])
    # 4. edge vignette (lens character)
    img = _vignette(img, PRESET["vignette_strength"])
    # 5. film grain (the biggest "real sensor" tell)
    img = _grain(img, PRESET["grain_sigma"])
    return img


def main():
    global PRESET
    args = [a for a in sys.argv[1:]]
    inplace = False
    if "--inplace" in args:
        inplace = True
        args = [a for a in args if a != "--inplace"]
    intensity = "medium"
    if args and args[0].startswith("--intensity="):
        intensity = args[0].split("=", 1)[1]
        args = args[1:]
    elif len(args) >= 2 and args[0] == "--intensity":
        intensity = args[1]
        args = args[2:]
    if intensity not in PRESETS:
        print(f"unknown intensity '{intensity}' (use light|medium|strong)", file=sys.stderr)
        sys.exit(2)
    PRESET = PRESETS[intensity]
    if not inplace and len(args) < 2:
        print("usage: realism_grade.py [--inplace] [--intensity light|medium|strong] <outdir> <file> [<file> ...]", file=sys.stderr)
        sys.exit(2)
    if inplace and len(args) < 1:
        print("usage: realism_grade.py --inplace [--intensity light|medium|strong] <file> [<file> ...]", file=sys.stderr)
        sys.exit(2)
    if not inplace:
        outdir = Path(args[0])
        outdir.mkdir(parents=True, exist_ok=True)
        files = args[1:]
    else:
        files = args
    for path in files:
        src = Path(path)
        if not src.exists():
            print(f"skip (missing): {src}", file=sys.stderr)
            continue
        with Image.open(src) as im:
            out = grade_image(im)
        if inplace:
            dest = src
            ext = src.suffix.lower()
            if ext in (".jpg", ".jpeg"):
                out.save(dest, "JPEG", quality=PRESET["jpeg_quality"], optimize=True)
            else:
                out.save(dest, "PNG", optimize=True)
        else:
            dest = outdir / (src.stem + ".jpg")
            out.save(dest, "JPEG", quality=PRESET["jpeg_quality"], optimize=True)
        print(f"graded [{intensity}]: {src} -> {dest}")


if __name__ == "__main__":
    main()
