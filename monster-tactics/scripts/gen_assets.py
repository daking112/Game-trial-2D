# Generates monster-tactics' hand-authored ground tiles and its stitched UI
# textures. Run from a checkout that also has the tinyswords/ project and the
# extracted "Custom Border and Panels"/"Humble Gift" packs under
# monster-tactics/public/assets/ - see README.md "Art".
#
#   python3 scripts/gen_assets.py
#
# Idempotent: re-running overwrites public/assets/{tiles,ui}/*.png in place.
import random
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import numpy as np
import os

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(REPO, "monster-tactics/public/assets")
BP_RAW = os.path.join(ASSETS, "border-panels-raw")
HG_RAW = os.path.join(ASSETS, "humble-gift-raw")
BP_SHEET = os.path.join(BP_RAW, "Border All 4.png")
HG_SHEET = os.path.join(HG_RAW, "Humble Gift - v1.3/PNG/SpriteSheet.png")
OUT_TILES = os.path.join(ASSETS, "tiles")
OUT_UI = os.path.join(ASSETS, "ui")


def ensure_extracted():
    """The two source packs ship as a .rar and a .zip (both already
    committed) rather than pre-extracted, to keep the repo lean - unpack them
    into scratch -raw/ dirs on demand. Requires `unrar` (apt install
    unrar-free) since 7z's bundled RAR codec doesn't support every RAR5
    compression method these were saved with."""
    if not os.path.isdir(BP_RAW):
        os.makedirs(BP_RAW)
        subprocess.run(
            ["unrar", "x", "-y", os.path.join(ASSETS, "Custom Border and Panels Menu All Part.rar")],
            cwd=BP_RAW, check=True
        )
    if not os.path.isdir(HG_RAW):
        os.makedirs(HG_RAW)
        subprocess.run(
            ["unzip", "-o", "-q", os.path.join(ASSETS, "Humble Gift - v1.3.zip"), "-d", HG_RAW],
            check=True
        )


# ---------------------------------------------------------------------------
# Part 1: hand-authored seamless ground tiles for the battle grid
# ---------------------------------------------------------------------------

def make_speckle_tile(size, base_color, speckles, seed):
    """Blocky, seamlessly-tiling pixel-art texture. Each speckle is drawn with
    wraparound copies at +-size so the tile has no seam when repeated."""
    random.seed(seed)
    img = Image.new('RGB', (size, size), base_color)
    draw = ImageDraw.Draw(img)
    for color, count, smin, smax in speckles:
        for _ in range(count):
            w = random.randint(smin, smax)
            h = random.randint(smin, smax)
            x = random.randint(0, size - 1)
            y = random.randint(0, size - 1)
            for dx in (-size, 0, size):
                for dy in (-size, 0, size):
                    draw.rectangle([x + dx, y + dy, x + dx + w - 1, y + dy + h - 1], fill=color)
    return img


# BattleScene's grid cell size - the tiles must be generated at exactly this
# size so they lay down one-per-cell with no cropping/gaps. Bumped from 64 to
# 96 alongside the 1920x1080 canvas (see BattleScene.js CELL and README.md).
TILE_SIZE = 96


def make_grass_tile():
    speckles = [
        ((0x35, 0x5c, 0x32), 58, 3, 7),   # shadow clumps
        ((0x5a, 0x8c, 0x4a), 66, 2, 4),   # light blade tufts
        ((0x6c, 0x9e, 0x55), 22, 2, 3),   # bright highlight flecks
        ((0x2e, 0x4f, 0x2b), 18, 2, 3),   # dark accents
    ]
    return make_speckle_tile(TILE_SIZE, (0x43, 0x70, 0x3d), speckles, seed=7)


def make_path_tile():
    speckles = [
        ((0x6b, 0x4f, 0x34), 48, 3, 7),   # darker dirt clumps
        ((0xa9, 0x86, 0x5c), 48, 2, 4),   # light dust highlight
        ((0x5a, 0x40, 0x28), 30, 2, 3),   # pebbles
        ((0xc2, 0xa3, 0x76), 14, 2, 3),   # bright sand fleck
    ]
    return make_speckle_tile(TILE_SIZE, (0x8a, 0x6a, 0x45), speckles, seed=13)


# ---------------------------------------------------------------------------
# Part 1b: the main menu's title logo - was a plain single-color
# Phaser Text object (flat, no depth), replaced with a pre-rendered PNG so it
# can have a real gradient fill, a thick hard-edged outline, and a soft drop
# shadow, none of which Phaser's Text object can do on its own without a
# canvas-texture trick anyway - simpler to just bake it here alongside every
# other generated asset. Kept crisp/pixel-art-appropriate throughout (the
# outline is a hard dilation, not a blur) except the drop shadow, which is
# deliberately soft - a blurred *shadow* under a crisp sprite reads as depth,
# it's blurring the actual letterforms that would look wrong for this style.
FREEMONO_BOLD = '/usr/share/fonts/truetype/freefont/FreeMonoBold.ttf'


def make_title_logo(text='MONSTER TACTICS', font_size=150):
    font = ImageFont.truetype(FREEMONO_BOLD, font_size)
    dummy = Image.new('L', (1, 1))
    bbox = ImageDraw.Draw(dummy).textbbox((0, 0), text, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]

    pad = 90  # room for the outline dilation + shadow offset + blur spread
    canvas_w, canvas_h = text_w + pad * 2, text_h + pad * 2
    origin = (pad - bbox[0], pad - bbox[1])

    # 1. Text mask (alpha only) - the source everything else derives from.
    text_mask = Image.new('L', (canvas_w, canvas_h), 0)
    ImageDraw.Draw(text_mask).text(origin, text, font=font, fill=255)

    # 2. Outline mask - dilate the text mask with a square max-filter (odd
    # kernel size = 2*radius+1) so it grows into a uniform ring around every
    # letter, including inner corners, which drawing offset copies in a ring
    # of angles tends to leave gaps on.
    outline_radius = 9
    outline_mask = text_mask.filter(ImageFilter.MaxFilter(outline_radius * 2 + 1))

    # 3. Soft drop shadow - the dilated shape again (reads better as a solid
    # silhouette than the thinner raw text), offset down-right, blurred.
    shadow = Image.new('L', (canvas_w, canvas_h), 0)
    shadow.paste(outline_mask, (14, 18))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))

    # 4. Vertical gradient fill for the letters themselves - warm gold to
    # amber, matching the game's existing essence/coin gold (#f5c94b) so the
    # logo reads as part of the same palette rather than a bolted-on asset.
    top_color = (255, 244, 200)
    bottom_color = (230, 140, 40)
    gradient = Image.new('RGB', (1, canvas_h))
    for y in range(canvas_h):
        t = y / max(1, canvas_h - 1)
        gradient.putpixel((0, y), tuple(
            int(top_color[i] + (bottom_color[i] - top_color[i]) * t) for i in range(3)
        ))
    gradient = gradient.resize((canvas_w, canvas_h))

    # Composite: shadow (bottom) -> solid dark outline -> gradient letters.
    out = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    out.paste((10, 8, 4, 255), (0, 0), shadow)
    outline_color = Image.new('RGBA', (canvas_w, canvas_h), (26, 20, 10, 255))
    out.paste(outline_color, (0, 0), outline_mask)
    gradient_rgba = gradient.convert('RGBA')
    gradient_rgba.putalpha(text_mask)
    out.alpha_composite(gradient_rgba)
    return out


# ---------------------------------------------------------------------------
# Part 1c: a soft radial vignette for MenuScene - darkens the corners/edges
# so the tiled grass background reads as depth-of-field around the title
# rather than one flat wall of repeating texture. Generated at half the
# canvas resolution and stretched (see MenuScene.js) since it's a smooth
# gradient with no fine detail to lose.
def make_vignette(w=960, h=540, strength=0.65):
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w / 2, h / 2
    # Normalized so the corners reach ~1.0 (full strength) and the center is 0.
    dist = np.sqrt(((xx - cx) / cx) ** 2 + ((yy - cy) / cy) ** 2) / np.sqrt(2)
    alpha = np.clip(dist, 0, 1) ** 1.6 * strength * 255
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :, 3] = alpha.astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


# ---------------------------------------------------------------------------
# Part 2: nine-slice stitching, two source shapes -
#  (a) a Tiny-Swords-style sheet already fragmented into a 3x3 grid of
#      separate corner/edge/center pieces (auto-detected via alpha gaps)
#  (b) a single flat square icon (the "Border and Panels" pack: 80 complete
#      64x64 frame designs per sheet, one sheet per color) - sliced into 9
#      pieces ourselves given a measured border thickness.
# Both funnel into the same stitch_nineslice() recomposition.
# ---------------------------------------------------------------------------

def detect_groups(mask_sum):
    """mask_sum: 1D array, nonzero where content exists. Returns list of
    (start, end) exclusive spans for contiguous nonzero runs."""
    groups = []
    in_run = False
    start = 0
    for i, v in enumerate(mask_sum):
        nz = v > 0
        if nz and not in_run:
            start = i
            in_run = True
        elif not nz and in_run:
            groups.append((start, i))
            in_run = False
    if in_run:
        groups.append((start, len(mask_sum)))
    return groups


def load_nineslice_cells(path):
    img = Image.open(path).convert('RGBA')
    arr = np.array(img)
    alpha = arr[:, :, 3]
    col_sum = alpha.sum(axis=0)
    row_sum = alpha.sum(axis=1)
    col_groups = detect_groups(col_sum)
    row_groups = detect_groups(row_sum)
    assert len(col_groups) == 3 and len(row_groups) == 3, \
        f"{path}: expected 3x3 cell groups, got {len(col_groups)}x{len(row_groups)}"
    cells = []
    for (ry0, ry1) in row_groups:
        row_cells = []
        for (cx0, cx1) in col_groups:
            row_cells.append(img.crop((cx0, ry0, cx1, ry1)))
        cells.append(row_cells)
    return cells


def single_frame_nineslice_cells(path, box, border):
    """Slice one complete bordered-square icon (at `box` in the sheet) into a
    3x3 nine-slice grid using a measured, uniform `border` thickness on all
    four sides - unlike load_nineslice_cells, the source has no pre-split
    pieces to detect, just one flat frame image."""
    frame = Image.open(path).convert('RGBA').crop(box)
    w, h = frame.size
    xs = [0, border, w - border, w]
    ys = [0, border, h - border, h]
    return [
        [frame.crop((xs[c], ys[r], xs[c + 1], ys[r + 1])) for c in range(3)]
        for r in range(3)
    ]


def add_sheen(img, strength=0.16, fade_to=0.55):
    """A faint top-to-transparent white highlight, masked by the image's own
    alpha so it never spills outside the button/panel's rounded shape - the
    nine-slice border (see stitch_nineslice) has real texture, but the
    stretched middle fill is dead flat; this reads as a subtle glossy/
    beveled highlight on every button and panel in the game for free,
    rather than a plain painted rectangle. fade_to is how far down (as a
    fraction of height) the highlight fades to nothing."""
    w, h = img.size
    sheen = Image.new('L', (1, h), 0)
    for y in range(h):
        t = y / max(1, h - 1)
        a = max(0, 1 - t / fade_to) * strength * 255 if t < fade_to else 0
        sheen.putpixel((0, y), int(a))
    sheen = sheen.resize((w, h))
    sheen = ImageChops.multiply(sheen, img.split()[3])
    out = img.copy()
    out.paste((255, 255, 255, 255), (0, 0), sheen)
    return out


def stitch_nineslice(cells, target_w, target_h):
    tl, tm, tr = cells[0]
    ml, mm, mr = cells[1]
    bl, bm, br = cells[2]
    left_w, right_w = tl.width, tr.width
    top_h, bottom_h = tl.height, bl.height
    mid_w = max(1, target_w - left_w - right_w)
    mid_h = max(1, target_h - top_h - bottom_h)

    out = Image.new('RGBA', (target_w, target_h), (0, 0, 0, 0))
    out.alpha_composite(tm.resize((mid_w, tm.height)), (left_w, 0))
    out.alpha_composite(bm.resize((mid_w, bm.height)), (left_w, target_h - bottom_h))
    out.alpha_composite(ml.resize((ml.width, mid_h)), (0, top_h))
    out.alpha_composite(mr.resize((mr.width, mid_h)), (target_w - right_w, top_h))
    out.alpha_composite(mm.resize((mid_w, mid_h)), (left_w, top_h))
    out.alpha_composite(tl, (0, 0))
    out.alpha_composite(tr, (target_w - right_w, 0))
    out.alpha_composite(bl, (0, target_h - bottom_h))
    out.alpha_composite(br, (target_w - right_w, target_h - bottom_h))
    return add_sheen(out)


def main():
    os.makedirs(OUT_TILES, exist_ok=True)
    os.makedirs(OUT_UI, exist_ok=True)
    ensure_extracted()

    make_grass_tile().save(os.path.join(OUT_TILES, 'grass.png'))
    make_path_tile().save(os.path.join(OUT_TILES, 'path.png'))
    print('wrote grass.png, path.png')

    make_title_logo().save(os.path.join(OUT_UI, 'title-logo.png'))
    print('wrote title-logo.png')

    make_vignette().save(os.path.join(OUT_UI, 'vignette.png'))
    print('wrote vignette.png')

    # "Border All 4" = the green colorway; cell (row1, col1) of its 10x8
    # grid of 64x64 frames is a plain rounded-square design (no scalloping),
    # measured at an 8px uniform border - see the measurement note in
    # README.md "Art".
    frame_cells = single_frame_nineslice_cells(BP_SHEET, (64, 64, 128, 128), border=8)
    # Sized for the 1920x1080 canvas (roughly 1.5x the sizes used at the old
    # 960x640 canvas) - panel-hud is deliberately oversized well past the
    # canvas width so its decorative corner clasps land off-screen and only
    # the plain stretched middle is ever visible (see README.md "Art").
    sizes = {
        'btn-large': (390, 84), 'btn-medium': (345, 75),
        'panel-hud': (2200, 75), 'panel-overlay': (930, 420),
        'panel-card-roster': (207, 177), 'panel-card-hub': (330, 195),
        'panel-card-banner': (306, 171), 'panel-egg': (150, 150),
        'bench-slot': (84, 84),
    }
    for name, (w, h) in sizes.items():
        stitch_nineslice(frame_cells, w, h).save(os.path.join(OUT_UI, f'{name}.png'))
        print('wrote', name, w, h)

    # Humble Gift's coin/star icons happen to already match this game's gold
    # essence/coin color (#f5c94b) - used as-is, no recoloring, next to the
    # HUD's Coins/Essence numbers.
    hg = Image.open(HG_SHEET).convert('RGBA')
    hg.crop((584, 232, 600, 248)).save(os.path.join(OUT_UI, 'icon-coin.png'))
    hg.crop((552, 232, 568, 248)).save(os.path.join(OUT_UI, 'icon-essence.png'))
    print('wrote icon-coin.png, icon-essence.png')


if __name__ == '__main__':
    main()
