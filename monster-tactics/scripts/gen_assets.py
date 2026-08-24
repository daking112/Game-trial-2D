# Generates monster-tactics' hand-authored ground tiles and its stitched UI
# textures. Run from a checkout that also has the tinyswords/ project (its
# Tiny Swords UI sheets are the stitching source) - see README.md "Art".
#
#   python3 scripts/gen_assets.py
#
# Idempotent: re-running overwrites public/assets/{tiles,ui}/*.png in place.
import random
from PIL import Image, ImageDraw
import numpy as np
import os

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TS_UI = os.path.join(REPO, "tinyswords/public/assets/tinyswords/UI Elements/UI Elements")
OUT_TILES = os.path.join(REPO, "monster-tactics/public/assets/tiles")
OUT_UI = os.path.join(REPO, "monster-tactics/public/assets/ui")


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


def make_grass_tile():
    speckles = [
        ((0x35, 0x5c, 0x32), 26, 2, 5),   # shadow clumps
        ((0x5a, 0x8c, 0x4a), 30, 1, 3),   # light blade tufts
        ((0x6c, 0x9e, 0x55), 10, 1, 2),   # bright highlight flecks
        ((0x2e, 0x4f, 0x2b), 8, 1, 2),    # dark accents
    ]
    return make_speckle_tile(64, (0x43, 0x70, 0x3d), speckles, seed=7)


def make_path_tile():
    speckles = [
        ((0x6b, 0x4f, 0x34), 22, 2, 5),   # darker dirt clumps
        ((0xa9, 0x86, 0x5c), 22, 1, 3),   # light dust highlight
        ((0x5a, 0x40, 0x28), 14, 1, 2),   # pebbles
        ((0xc2, 0xa3, 0x76), 6, 1, 2),    # bright sand fleck
    ]
    return make_speckle_tile(64, (0x8a, 0x6a, 0x45), speckles, seed=13)


# ---------------------------------------------------------------------------
# Part 2: auto-detect 3x3 nine-slice cells in a Tiny Swords UI sheet (handles
# both zero-gap sheets and sheets with transparent spacing between cells) and
# recompose into a single flattened texture at a target size.
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

    make_grass_tile().save(os.path.join(OUT_TILES, 'grass.png'))
    make_path_tile().save(os.path.join(OUT_TILES, 'path.png'))
    print('wrote grass.png, path.png')

    btn_cells = load_nineslice_cells(os.path.join(TS_UI, 'Buttons', 'BigBlueButton_Regular.png'))
    for name, (w, h) in {'btn-large': (260, 56), 'btn-medium': (230, 50)}.items():
        stitch_nineslice(btn_cells, w, h).save(os.path.join(OUT_UI, f'{name}.png'))
        print('wrote', name, w, h)

    wood_cells = load_nineslice_cells(os.path.join(TS_UI, 'Wood Table', 'WoodTable.png'))
    panel_sizes = {
        'panel-hud': (1100, 50),
        'panel-overlay': (620, 280),
        'panel-card-roster': (138, 118),
        'panel-card-hub': (220, 130),
        'panel-card-banner': (204, 114),
        'panel-egg': (100, 100),
    }
    for name, (w, h) in panel_sizes.items():
        stitch_nineslice(wood_cells, w, h).save(os.path.join(OUT_UI, f'{name}.png'))
        print('wrote', name, w, h)


if __name__ == '__main__':
    main()
