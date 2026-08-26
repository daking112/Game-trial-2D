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

# This game has exactly 18 base species each with exactly one evolved form
# (SPECIES / EVOLVED_SPECIES / EVOLUTION_MAP in data/monsters.js), and the
# pack has exactly 18 evolution lines - so each pair gets its own line and
# evolving a monster now visibly evolves its art instead of swapping to an
# unrelated sprite. Lines were matched to species by type and character
# from a rendered contact sheet of all 18 (a tusked pig line for the
# hornlet -> Tuskram pair, a one-eyed floating line for geodrone ->
# Geodronarch, a pink blob for puffle -> Pufflord, and so on).
#
# The base species takes the line's stage 1 and the evolved form takes
# stage 3 (its final form) rather than stage 2: this game has a single
# evolution step, so it should land on the pack's biggest visual payoff.
# Stage 2 of every line is deliberately left unused and is what a future
# mid-tier evolution would draw from.
#
# (line_index, base_species_id, evolved_species_id)
LINE_ASSIGNMENTS = [
    (0,  'molecap',   'molecrusher_evo'),   # dark armored brute - EARTH epic
    (1,  'icewhelp',  'icewyrm_evo'),       # pale/icy winged - WATER rare
    (2,  'calfrage',  'bisonlord_evo'),     # magenta horned - NORMAL rare
    (3,  'snoutling', 'snoutzar_evo'),      # brown snouted beast - EARTH common
    (4,  'ogglord',   'oggmonarch_evo'),    # plant/tree titan - GRASS legendary
    (5,  'rollpup',   'rollodon_evo'),      # green rolling shell - GRASS common
    (6,  'puffle',    'pufflord_evo'),      # pink blob - NORMAL rare
    (7,  'pincer',    'pincerlord_evo'),    # grey stone/claw - EARTH rare
    (8,  'hornlet',   'tuskram_evo'),       # tusked pig - EARTH common
    (9,  'shellcrab', 'shellclaw_evo'),     # teal crystal shell - WATER common
    (10, 'frostmaw',  'glacimaw_evo'),      # dark teal crystal maw - WATER legendary
    (11, 'grubcoil',  'grubcoilus_evo'),    # green striped grub - GRASS rare
    (12, 'snarlpup',  'ragefang_evo'),      # red spotted - FIRE common
    (13, 'tigrub',    'tigrubex_evo'),      # red/orange flame beast - FIRE epic
    (14, 'goldwasp',  'thundasp_evo'),      # gold/yellow flyer - ELECTRIC legendary
    (15, 'geodrone',  'geodronarch_evo'),   # one-eyed floating drone - NORMAL epic
    (16, 'boltbee',   'boltswarm_evo'),     # blue/yellow flyer - ELECTRIC common
    (17, 'tidewisp',  'tidewraith_evo'),    # blue water blob - WATER rare
]

BASE_STAGE = 0      # stage 1 of the line
EVOLVED_STAGE = 2   # stage 3 - see the note above on skipping stage 2

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
    for line_index, base_id, evolved_id in LINE_ASSIGNMENTS:
        picks.append((base_id, line_index, BASE_STAGE))
        picks.append((evolved_id, line_index, EVOLVED_STAGE))

    out = Image.new('RGBA', (BLOCK * SRC_CELL, len(picks) * BLOCK * SRC_CELL), (0, 0, 0, 0))
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
    print(f'wrote towers.png ({out.width}x{out.height}, {len(picks)} monsters)')
    print()
    print('data/monsters.js towerIndex values:')
    for species_id, m in index.items():
        print(f'  {species_id}: {m}')


if __name__ == '__main__':
    main()
