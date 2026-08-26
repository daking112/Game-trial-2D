# Builds this game's animated enemy spritesheets from the "MINI DUNGEON
# MONSTERS" asset pack (a purchased itch.io pack by Beowulf -
# https://beowulf.itch.io/ - check its own license before reuse outside
# this project, same as the other purchased packs under public/assets/,
# see README.md "Art").
#
# Run from a checkout that also has the pack's zip already committed under
# monster-tactics/public/assets/ - see README.md "Enemy sprites".
#
#   python3 scripts/gen_enemies.py
#
# Idempotent: re-running overwrites public/assets/enemies/*.png in place.
import os
import zipfile
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(REPO, "monster-tactics/public/assets")
PACK_ZIP = os.path.join(ASSETS, "MINI DUNGEON MONSTERS_V2.11.zip")
RAW = os.path.join(ASSETS, "mini-dungeon-monsters-raw")
INDIVIDUAL = os.path.join(RAW, "MINI DUNGEON MONSTERS_V2.11", "(INDIVIDUAL MONSTERS) 2.1")
OUT_DIR = os.path.join(ASSETS, "enemies")


def ensure_extracted():
    if os.path.isdir(RAW):
        return
    os.makedirs(RAW)
    with zipfile.ZipFile(PACK_ZIP) as z:
        z.extractall(RAW)


# Every individual monster in the pack ships one sheet.png, verified (see
# README.md "Enemy sprites") to always be a 3-col x 4-row grid at the
# monster's native frame size: row 0 = walking down, row 1 = left, row 2 =
# right, row 3 = up (matched against the pack's own per-direction GIFs by
# diffing pixels, not guessed) - column 2 is a duplicate of column 0 (an
# idle pose), so only columns 0-1 are the real 2-frame walk cycle and get
# used here.
#
# id: this game's ENEMY_SPECIES id (data/monsters.js) the sprite is for.
# folder/sheet: where the source sheet lives under (INDIVIDUAL MONSTERS).
# size: native frame size in px (16 for regular monsters, 32/64 for the
# bigger Dragon_* ones - regular and boss enemies go into separate output
# sheets since a Phaser spritesheet needs one uniform frame size).
REGULAR_PICKS = [
    ('widow',      'Monster_29',  'monster_29_sheet.png',  16),  # many-legged - reads as a spider
    ('rollodon',   'Monster_02',  'monster_02_sheet.png',  16),  # round green blob
    ('ragefang',   'Monster_93',  'monster_93_sheet.png',  16),  # horned/fanged, aggressive red
    ('tuskram',    'Monster_72',  'monster_72_sheet.png',  16),  # tan tusked beast
    ('clawcrab',   'Monster_28',  'monster_28_sheet.png',  16),  # literal red crab
    ('bouldergeist', 'Monster_46', 'monster_46_sheet.png', 16),  # round rock/ghost face
    ('ironshell',  'Monster_10',  'monster_10_sheet.png',  16),  # armored/helmeted look
    ('zipfin',     'Monster_109', 'monster_109_sheet.png', 16),  # cyan fish
    ('mossback',   'Monster_43',  'monster_43_sheet.png',  16),  # green mossy/leafy
    ('splitworm',  'Monster_66',  'monster_66_sheet.png',  16),  # purple worm/snake
    ('wormlet',    'Monster_23',  'monster_23_sheet.png',  16),  # mint worm/snake - visually
                                                                   # related to splitworm, distinct
                                                                   # color for the weaker child
]

# Bosses get the pack's Dragon_* sheets instead - genuinely bigger native
# art (32x32 vs the regular monsters' 16x16), not just a bigger .setScale,
# so a boss actually reads as more detailed up close, not just blown up.
BOSS_PICKS = [
    ('kingcrab',    'Monster_Dragon_116', 'monster_dragon_116_sheet.png', 32),  # dark, heavy - tanky wall
    ('zephyrus',    'Monster_Dragon_111', 'monster_dragon_111_sheet.png', 32),  # blue, sleek - fast
    ('broodmother', 'Monster_Dragon_112', 'monster_dragon_112_sheet.png', 32),  # green/gold - grass type
]


def build_sheet(picks, out_name):
    """Each monster gets a 2-col x 4-row block (2 walk frames x 4
    directions) stacked vertically - monster m, direction d's block starts
    at row (m*4 + d). One frame size per output sheet (Phaser spritesheet
    requirement), so regular/boss picks are built as separate images."""
    size = picks[0][3]
    assert all(p[3] == size for p in picks), 'build_sheet requires uniform frame size'
    cols, rows = 2, len(picks) * 4
    out = Image.new('RGBA', (cols * size, rows * size), (0, 0, 0, 0))
    index = {}
    for m, (enemy_id, folder, sheet_name, _) in enumerate(picks):
        sheet = Image.open(os.path.join(INDIVIDUAL, folder, sheet_name)).convert('RGBA')
        for d in range(4):
            for f in range(2):
                frame = sheet.crop((f * size, d * size, f * size + size, d * size + size))
                out.paste(frame, (f * size, (m * 4 + d) * size))
        index[enemy_id] = m
    out.save(os.path.join(OUT_DIR, out_name))
    return index


def main():
    ensure_extracted()
    os.makedirs(OUT_DIR, exist_ok=True)

    regular_index = build_sheet(REGULAR_PICKS, 'enemies-regular.png')
    boss_index = build_sheet(BOSS_PICKS, 'enemies-boss.png')

    print('wrote enemies-regular.png, index:', regular_index)
    print('wrote enemies-boss.png, index:', boss_index)
    print()
    print('data/monsters.js enemyIndex values (frameSize 16 regular / 32 boss):')
    for enemy_id, m in regular_index.items():
        print(f"  {enemy_id}: sheetKey ENEMY_REGULAR_SHEET, enemyIndex {m}")
    for enemy_id, m in boss_index.items():
        print(f"  {enemy_id}: sheetKey ENEMY_BOSS_SHEET, enemyIndex {m}")


if __name__ == '__main__':
    main()
