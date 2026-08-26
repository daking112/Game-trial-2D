# Builds the multiplayer player-avatar spritesheet from the "Pixel Fantasy -
# Monster Tamer" asset pack (https://pixel-fantasy.itch.io/ - editable and
# usable in commercial and non-commercial projects, not resellable; see the
# LICENSE.txt inside the zip and README.md "Player avatars").
#
#   python3 scripts/gen_avatars.py
#
# Idempotent: re-running overwrites public/assets/avatars/avatars.png.
import os
import zipfile
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(REPO, "monster-tactics/public/assets")
PACK_ZIP = os.path.join(ASSETS, "pixel-fantasy-monster-tamer-v1.0.zip")
RAW = os.path.join(ASSETS, "monster-tamer-raw")
OUT_DIR = os.path.join(ASSETS, "avatars")

# Both sheets in the pack share one layout, verified (see README.md
# "Player avatars") by alpha-gap analysis for the cell size and by
# frame-to-frame pixel diffing for the row meanings: 16x20 cells, 21 cols
# (7 characters x 3 frames) x 6 rows.
#
# Rows 0-2 are a real walk cycle - three visibly distinct steps, frame 0 !=
# frame 2 - and rows 3-5 are an idle, where frame 0 and frame 2 are pixel
# identical (an A-B-A ping-pong). Within each set the order is side, down,
# up. "side" is drawn facing right; facing left is that art flipped
# horizontally rather than its own row.
SRC_SHEETS = ['character_sheet.png', 'character_sheet_2.png']
CELL_W, CELL_H = 16, 20
FRAMES = 3
CHARS_PER_SHEET = 7
SRC_ROWS = ['walk-side', 'walk-down', 'walk-up', 'idle-side', 'idle-down', 'idle-up']


def ensure_extracted():
    if os.path.isdir(RAW):
        return
    os.makedirs(RAW)
    with zipfile.ZipFile(PACK_ZIP) as z:
        z.extractall(RAW)


def main():
    ensure_extracted()
    os.makedirs(OUT_DIR, exist_ok=True)

    # Output keeps the same shape the other generated sheets use so they all
    # read the same way from Phaser: one avatar per block of consecutive
    # rows, avatar a / row-kind k / frame f at sheet row (a*6 + k), col f.
    total = len(SRC_SHEETS) * CHARS_PER_SHEET
    out = Image.new('RGBA', (FRAMES * CELL_W, total * len(SRC_ROWS) * CELL_H), (0, 0, 0, 0))

    avatar = 0
    for sheet_name in SRC_SHEETS:
        src = Image.open(os.path.join(RAW, sheet_name)).convert('RGBA')
        for ch in range(CHARS_PER_SHEET):
            for k in range(len(SRC_ROWS)):
                for f in range(FRAMES):
                    c = ch * FRAMES + f
                    box = (c * CELL_W, k * CELL_H, c * CELL_W + CELL_W, k * CELL_H + CELL_H)
                    out.paste(src.crop(box), (f * CELL_W, (avatar * len(SRC_ROWS) + k) * CELL_H))
            avatar += 1

    out.save(os.path.join(OUT_DIR, 'avatars.png'))
    print(f'wrote avatars.png ({out.width}x{out.height}, {total} avatars x {len(SRC_ROWS)} rows)')
    print('row order per avatar:', ', '.join(SRC_ROWS))


if __name__ == '__main__':
    main()
