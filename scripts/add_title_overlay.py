"""
One-off script: adds the Sector Galactica title overlay
to public/image.png. Source is preserved as public/image_src.png (re-runnable).

Requires: pip install pillow
"""

import os
import shutil

from PIL import Image, ImageDraw, ImageFont

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
IMAGE_PATH   = os.path.join(PROJECT_ROOT, "public", "image.png")
IMAGE_SRC    = os.path.join(PROJECT_ROOT, "public", "image_src.png")

# ── Fonts ─────────────────────────────────────────────────────────────────────
FONT_BOLD    = "C:/Windows/Fonts/segoeuib.ttf"
FONT_SEMIBOLD = "C:/Windows/Fonts/seguisb.ttf"
FONT_REG     = "C:/Windows/Fonts/segoeui.ttf"

# ── Text ─────────────────────────────────────────────────────────────────────
LINE1 = "SECTOR"
LINE2 = "GALACTICA"
LINE3 = "CONTRACTS AND CAPITAL FLOWS. VISUALIZED."

# ── Sizes & position ──────────────────────────────────────────────────────────
X          = 44
Y          = 36
SIZE1      = 136    # SECTOR
SIZE2      = 52     # GALACTICA
SIZE3      = 26     # subtitle
GAP12      = 2      # between line1 baseline and line2
GAP23      = 18     # between line2 and subtitle

# ── Colours ───────────────────────────────────────────────────────────────────
C_WHITE    = (255, 239, 224, 255)
C_ORANGE   = (232, 131, 42, 235)
C_SUB      = (232, 131, 42, 225)
C_SHADOW   = (0,   0,   0,   210)


def load_font(size: int, *candidates: str):
    for candidate in candidates:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def txt(draw, pos, text, font, colour, shadow_offset=2):
    x, y = pos
    draw.text((x + shadow_offset, y + shadow_offset), text, font=font, fill=C_SHADOW)
    draw.text((x, y), text, font=font, fill=colour)


def draw_overlay(image_path: str) -> None:
    if not os.path.exists(IMAGE_SRC):
        shutil.copy2(image_path, IMAGE_SRC)
        print(f"Backed up → {IMAGE_SRC}")
        src = image_path
    else:
        src = IMAGE_SRC

    img = Image.open(src).convert("RGBA")
    w, h = img.size
    print(f"Opened {src}  ({w}×{h})")

    f1 = load_font(SIZE1, FONT_BOLD, FONT_SEMIBOLD, FONT_REG)
    f2 = load_font(SIZE2, FONT_SEMIBOLD, FONT_BOLD, FONT_REG)
    f3 = load_font(SIZE3, FONT_SEMIBOLD, FONT_BOLD, FONT_REG)

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw    = ImageDraw.Draw(overlay)

    text_x = X

    # Line 1 — SECTOR
    h1 = f1.getbbox(LINE1)[3]
    txt(draw, (text_x, Y), LINE1, f1, C_WHITE, shadow_offset=3)

    # Line 2 — GALACTICA  (letter-spaced via ordinary text, tracked manually)
    y2 = Y + h1 + GAP12
    # use stroke_width for the faint outline look
    draw.text((text_x + 3 + 2, y2 + 2), LINE2, font=f2, fill=C_SHADOW, spacing=4)
    draw.text((text_x + 3,     y2),     LINE2, font=f2, fill=C_ORANGE,
              stroke_width=0)

    h2 = f2.getbbox(LINE2)[3]

    # Thin separator line
    sep_y  = y2 + h2 + GAP23 // 2
    sep_w  = f1.getbbox(LINE1)[2]
    draw.line([(text_x, sep_y), (text_x + sep_w, sep_y)], fill=(232, 131, 42, 90), width=1)

    # Line 3 — subtitle
    y3 = sep_y + GAP23 // 2 + 3
    txt(draw, (text_x + 2, y3), LINE3, f3, C_SUB, shadow_offset=1)

    result = Image.alpha_composite(img, overlay)
    result.save(image_path)
    print(f"Saved → {image_path}")


if __name__ == "__main__":
    draw_overlay(IMAGE_PATH)


