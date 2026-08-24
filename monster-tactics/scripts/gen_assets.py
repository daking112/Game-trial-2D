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
from PIL import Image, ImageDraw
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
    return out


def main():
    os.makedirs(OUT_TILES, exist_ok=True)
    os.makedirs(OUT_UI, exist_ok=True)
    ensure_extracted()

    make_grass_tile().save(os.path.join(OUT_TILES, 'grass.png'))
    make_path_tile().save(os.path.join(OUT_TILES, 'path.png'))
    print('wrote grass.png, path.png')

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
