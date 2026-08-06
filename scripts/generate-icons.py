#!/usr/bin/env python3
"""Render the toll-e app icons into public/.

The mark is drawn geometrically rather than set in a typeface: the app's Inter
wordmark isn't installed on every machine, and a vector-drawn glyph renders
identically wherever this runs. Re-run after changing the brand colors.

    python3 scripts/generate-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

INK = (11, 11, 11, 255)  # --background (dark)
BRAND = (240, 185, 11, 255)  # --primary
PUBLIC = Path(__file__).resolve().parent.parent / "public"

# 4x supersampling — Pillow has no anti-aliased shape drawing, so shapes are
# drawn large and downsampled.
SS = 4


def draw_mark(size: int, bg, fg, scale: float) -> Image.Image:
    """A lowercase 't' (stem + crossbar + foot), centred, occupying `scale` of the canvas."""
    px = size * SS
    img = Image.new("RGBA", (px, px), bg)
    d = ImageDraw.Draw(img)

    box = px * scale  # the mark's bounding square
    cx, cy = px / 2, px / 2
    stem_w = box * 0.20
    r = stem_w / 2

    top = cy - box / 2
    bottom = cy + box / 2
    # Stem, offset left so the foot's rightward curve keeps the glyph balanced.
    stem_x = cx - stem_w * 0.9
    d.rounded_rectangle(
        [stem_x, top, stem_x + stem_w, bottom - stem_w * 0.9],
        radius=r,
        fill=fg,
    )
    # Foot: the tail turning right at the baseline. Kept to one stem-width so
    # the glyph stays a 't' — any thicker and it reads as a solid block.
    d.rounded_rectangle(
        [stem_x, bottom - stem_w, stem_x + box * 0.50, bottom],
        radius=r,
        fill=fg,
    )
    # Crossbar.
    bar_y = top + box * 0.26
    d.rounded_rectangle(
        [cx - box * 0.44, bar_y, cx + box * 0.30, bar_y + stem_w * 0.86],
        radius=stem_w * 0.43,
        fill=fg,
    )
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    for size in (192, 512):
        # `any`: full-bleed dark tile, brand mark. iOS rounds it itself.
        draw_mark(size, INK, BRAND, 0.56).save(PUBLIC / f"icon-{size}.png")
        # `maskable`: Android crops to its own shape, so the mark stays inside
        # the safe zone (centre 80%) and the brand colour becomes the field.
        draw_mark(size, BRAND, INK, 0.42).save(PUBLIC / f"icon-maskable-{size}.png")
    # apple-touch-icon: iOS ignores maskable and never renders transparency.
    draw_mark(180, INK, BRAND, 0.56).save(PUBLIC / "apple-touch-icon.png")
    print("wrote:", ", ".join(sorted(p.name for p in PUBLIC.glob("*.png"))))


if __name__ == "__main__":
    main()
