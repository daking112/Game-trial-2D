# Builds the animated player-species (tower monster) spritesheet from the
# "Monster Evolution Sprites" asset pack (by the Pixel Fantasy author -
# https://pixel-fantasy.itch.io/ - editable/usable in commercial and
# non-commercial projects, not resellable; see the LICENSE.txt inside the
# zip and README.md "Tower monster sprites").
#
#   python3 scripts/gen_towers.py
#
# Idempotent: re-running overwrites public/assets/towers/towers.png in place.
import os
import zipfile
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(REPO, "monster-tactics/public/assets")
PACK_ZIP = os.path.join(ASSETS, "Monster-Evolution-Sprites-1.2.zip")
RAW = os.path.join(ASSETS, "monster-evolution-raw")
SRC_SHEET = os.path.join(RAW, "monster_evolutions_01.png")
OUT_DIR = os.path.join(ASSETS, "towers")

# Source sheet is a flat 16px grid, 27 cols x 18 rows. Verified (see
# README.md "Tower monster sprites") to be built out of 3x3 blocks: within
# a block, the 3 columns are animation frames and the 3 rows are facings -
# row 0 front/down (eyes toward camera), row 1 back/up (no face), row 2
# side profile. Three blocks side by side make one 3-stage evolution line,
# so the sheet holds 3 lines across x 6 bands down = 18 lines x 3 stages =
# 54 monsters.
SRC_CELL = 16
BLOCK = 3          # a monster block is 3 cells wide and 3 cells tall
LINES_ACROSS = 3
BANDS_DOWN = 6

# The pack ships 18 three-stage evolution lines and this game's species are
# organised into matching three-stage chains (SPECIES / EVOLVED_SPECIES /
# EVOLUTION_MAP in data/monsters.js), so a line's stage 1/2/3 art maps
# straight onto a chain's base/mid/final form and evolving a monster
# visibly grows the same creature up rather than swapping it for an
# unrelated sprite. Lines were matched to species by type and character
# from a rendered contact sheet of all 18 (a tusked pig line for the
# hornlet -> Hornbrute -> Tuskram chain, a one-eyed floating line for
# geodrone -> Geosentry -> Geodronarch, a pink blob for the Puffle chain,
# and so on).
#
# (line_index, [stage1_id, stage2_id, stage3_id]) - every line runs the
# game's full three-stage chain, so all three of the pack's stages are used.
LINE_ASSIGNMENTS = [
    (0,  ['molecap',   'molebore_mid',    'molecrusher_evo']),   # dark armored brute - EARTH
    (1,  ['icewhelp',  'icefang_mid',     'icewyrm_evo']),       # pale/icy winged - WATER
    (2,  ['calfrage',  'bisonrage_mid',   'bisonlord_evo']),     # magenta horned - NORMAL
    (3,  ['snoutling', 'snoutbrute_mid',  'snoutzar_evo']),      # brown snouted beast - EARTH
    (4,  ['ogglord',   'oggtitan_mid',    'oggmonarch_evo']),    # plant/tree titan - GRASS
    (5,  ['rollpup',   'tumblehide_mid',  'rollodon_evo']),      # green rolling shell - GRASS
    (6,  ['puffle',    'pufflump_mid',    'pufflord_evo']),      # pink blob - NORMAL
    (7,  ['pincer',    'pincerclaw_mid',  'pincerlord_evo']),    # grey stone/claw - EARTH
    (8,  ['hornlet',   'hornbrute_mid',   'tuskram_evo']),       # tusked pig - EARTH
    (9,  ['shellcrab', 'shellguard_mid',  'shellclaw_evo']),     # teal crystal shell - WATER
    (10, ['frostmaw',  'frostfang_mid',   'glacimaw_evo']),      # dark teal crystal maw - WATER
    (11, ['grubcoil',  'coilworm_mid',    'grubcoilus_evo']),    # green striped grub - GRASS
    (12, ['snarlpup',  'snarlfang_mid',   'ragefang_evo']),      # red spotted - FIRE
    (13, ['tigrub',    'tigrunt_mid',     'tigrubex_evo']),      # red/orange flame beast - FIRE
    (14, ['goldwasp',  'goldstinger_mid', 'thundasp_evo']),      # gold/yellow flyer - ELECTRIC
    (15, ['geodrone',  'geosentry_mid',   'geodronarch_evo']),   # one-eyed floating drone - NORMAL
    (16, ['boltbee',   'boltdrone_mid',   'boltswarm_evo']),     # blue/yellow flyer - ELECTRIC
    (17, ['tidewisp',  'tidespirit_mid',  'tidewraith_evo']),    # blue water blob - WATER
]

DIRECTIONS = ['down', 'up', 'side']


def ensure_extracted():
    if os.path.isdir(RAW):
        return
    os.makedirs(RAW)
    with zipfile.ZipFile(PACK_ZIP) as z:
        z.extractall(RAW)


def block_origin(line_index, stage):
    """Top-left cell (col, row) of one monster's 3x3 block."""
    band = line_index // LINES_ACROSS
    line_in_band = line_index % LINES_ACROSS
    col = line_in_band * (BLOCK * 3) + stage * BLOCK
    row = band * BLOCK
    return col, row


def main():
    ensure_extracted()
    os.makedirs(OUT_DIR, exist_ok=True)
    src = Image.open(SRC_SHEET).convert('RGBA')

    # Output keeps the same shape gen_enemies.py uses so both sheets read
    # the same way from Phaser: one monster per 3-col x 3-row block stacked
    # vertically, monster m / direction d / frame f at row (m*3 + d), col f.
    picks = []
    for line_index, stage_ids in LINE_ASSIGNMENTS:
        for stage, species_id in enumerate(stage_ids):
            picks.append((species_id, line_index, stage))

    total = len(picks)
    out = Image.new('RGBA', (BLOCK * SRC_CELL, total * BLOCK * SRC_CELL), (0, 0, 0, 0))
    index = {}
    for m, (species_id, line_index, stage) in enumerate(picks):
        col0, row0 = block_origin(line_index, stage)
        for d in range(BLOCK):
            for f in range(BLOCK):
                c, r = col0 + f, row0 + d
                frame = src.crop((c * SRC_CELL, r * SRC_CELL,
                                  c * SRC_CELL + SRC_CELL, r * SRC_CELL + SRC_CELL))
                out.paste(frame, (f * SRC_CELL, (m * BLOCK + d) * SRC_CELL))
        index[species_id] = m

    out.save(os.path.join(OUT_DIR, 'towers.png'))
    print(f'wrote towers.png ({out.width}x{out.height}, {total} monsters from the pack)')
    print()
    print('data/monsters.js towerIndex values:')
    for species_id, m in index.items():
        print(f'  {species_id}: {m}')


if __name__ == '__main__':
    main()
