# Builds 15 new hand-picked species chains (45 monsters total) by recoloring
# real donor lines from the "Monster Evolution Sprites" pack rather than
# drawing new geometry from scratch. Two from-scratch attempts (hand-typed
# pixel grids, then parametric coordinate generation) both read as
# generic/geometric rather than professionally drawn - recoloring real pack
# pixels keeps every structural pixel (silhouette, shading bands, outline
# weight) genuinely pack-made, so it can't fail that bar the way originals did.
#
# Recolor is a "colorize" pass, not a hue-rotate: every non-outline,
# non-white pixel gets its hue and saturation set directly to a target
# (value/lightness kept as-is, which is what preserves the pack's own
# shading bands). Outline (near-black) and eye/sock white (near-white,
# low-saturation) pixels are left untouched, same as the pack's own art.
#
# Each new chain also reuses its donor line's own base/mid/final stat
# progression (maxHp/attack/range/attackIntervalMs/cost/rarity) verbatim
# from data/monsters.js - that progression is already tuned, and every new
# chain is a re-flavored (retyped, recolored) version of that same
# creature, so borrowing its numbers is honest, not a placeholder.
import colorsys
import os

from PIL import Image

CELL = 16
BLOCK = 3
LINES_ACROSS = 3


def block_origin(line_index, stage):
    band = line_index // LINES_ACROSS
    line_in_band = line_index % LINES_ACROSS
    col = line_in_band * (BLOCK * 3) + stage * BLOCK
    row = band * BLOCK
    return col, row


def recolor_colorize(img, hue_deg, sat, val_mult=1.0):
    """Force hue+saturation on colored pixels; leaves outline/white/transparent
    pixels untouched so shading bands and linework stay exactly pack-made."""
    img = img.convert('RGBA')
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if v < 0.14:
                continue  # outline black - leave as-is
            if v > 0.82 and s < 0.18:
                continue  # eye white / socks - leave as-is
            v = max(0.0, min(1.0, v * val_mult))
            nr, ng, nb = colorsys.hsv_to_rgb(hue_deg / 360.0, sat, v)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return img


# donor line index, per pack LINE_ASSIGNMENTS order in gen_towers.py:
#   0 molecap/molebore/molecrusher     9  shellcrab/shellguard/shellclaw
#   1 icewhelp/icefang/icewyrm         10 frostmaw/frostfang/glacimaw
#   2 calfrage/bisonrage/bisonlord     11 grubcoil/coilworm/grubcoilus
#   3 snoutling/snoutbrute/snoutzar    12 snarlpup/snarlfang/ragefang
#   4 ogglord/oggtitan/oggmonarch      13 tigrub/tigrunt/tigrubex
#   5 rollpup/tumblehide/rollodon      14 goldwasp/goldstinger/thundasp
#   6 puffle/pufflump/pufflord         15 geodrone/geosentry/geodronarch
#   7 pincer/pincerclaw/pincerlord     16 boltbee/boltdrone/boltswarm
#   8 hornlet/hornbrute/tuskram        17 tidewisp/tidespirit/tidewraith
#
# (base_id, base_name, mid_id, mid_name, evo_id, evo_name, type, donor_line,
#  hue_deg, sat, val_mult, donor_stat_species_ids) - donor_stat_species_ids
# names the donor's own [base, mid, final] ids, used only to look up their
# stat quadruples out of data/monsters.js by hand (see REMIX_SPECIES below,
# stats copied verbatim as a comment trail for traceability).
REMIX_CHAINS = [
    dict(ids=('zapling', 'zapfowl_mid', 'voltvern_evo'),
         names=('Zapling', 'Zapfowl', 'Voltvern'),
         type='ELECTRIC', donor=16, hue=50, sat=0.80, val=1.0,
         donor_ids=('boltbee', 'boltdrone_mid', 'boltswarm_evo')),
    dict(ids=('emberimp', 'emberbrute_mid', 'cinderfiend_evo'),
         names=('Emberimp', 'Emberbrute', 'Cinderfiend'),
         type='FIRE', donor=12, hue=8, sat=0.85, val=0.92,
         donor_ids=('snarlpup', 'snarlfang_mid', 'ragefang_evo')),
    dict(ids=('thornshell', 'thornguard_mid', 'bramblemaw_evo'),
         names=('Thornshell', 'Thornguard', 'Bramblemaw'),
         type='GRASS', donor=9, hue=95, sat=0.55, val=1.0,
         donor_ids=('shellcrab', 'shellguard_mid', 'shellclaw_evo')),
    dict(ids=('mothling', 'duskwing_mid', 'lunamoth_evo'),
         names=('Mothling', 'Duskwing', 'Lunamoth'),
         type='NORMAL', donor=14, hue=270, sat=0.40, val=1.0,
         donor_ids=('goldwasp', 'goldstinger_mid', 'thundasp_evo')),
    dict(ids=('dewdrip', 'tidebell_mid', 'maelstrom_evo'),
         names=('Dewdrip', 'Tidebell', 'Maelstrom'),
         type='WATER', donor=17, hue=190, sat=0.55, val=1.0,
         donor_ids=('tidewisp', 'tidespirit_mid', 'tidewraith_evo')),
    dict(ids=('pebblet', 'cragfist_mid', 'terralith_evo'),
         names=('Pebblet', 'Cragfist', 'Terralith'),
         type='EARTH', donor=7, hue=30, sat=0.30, val=1.0,
         donor_ids=('pincer', 'pincerclaw_mid', 'pincerlord_evo')),
    dict(ids=('pyrelet', 'blazeplume_mid', 'solaris_evo'),
         names=('Pyrelet', 'Blazeplume', 'Solaris'),
         type='FIRE', donor=1, hue=18, sat=0.80, val=1.0,
         donor_ids=('icewhelp', 'icefang_mid', 'icewyrm_evo')),
    dict(ids=('chimeling', 'tollward_mid', 'carillon_evo'),
         names=('Chimeling', 'Tollward', 'Carillon'),
         type='NORMAL', donor=15, hue=40, sat=0.50, val=1.0,
         donor_ids=('geodrone', 'geosentry_mid', 'geodronarch_evo')),
    dict(ids=('sparkmote', 'arcnode_mid', 'tesladon_evo'),
         names=('Sparkmote', 'Arcnode', 'Tesladon'),
         type='ELECTRIC', donor=6, hue=55, sat=0.85, val=1.0,
         donor_ids=('puffle', 'pufflump_mid', 'pufflord_evo')),
    dict(ids=('emberadder', 'cinderviper_mid', 'infernasp_evo'),
         names=('Emberadder', 'Cinderviper', 'Infernasp'),
         type='FIRE', donor=11, hue=10, sat=0.80, val=1.0,
         donor_ids=('grubcoil', 'coilworm_mid', 'grubcoilus_evo')),
    dict(ids=('tadpip', 'ripplefin_mid', 'tsunarine_evo'),
         names=('Tadpip', 'Ripplefin', 'Tsunarine'),
         type='WATER', donor=10, hue=140, sat=0.50, val=1.0,
         donor_ids=('frostmaw', 'frostfang_mid', 'glacimaw_evo')),
    dict(ids=('petaline', 'petalguard_mid', 'bloomqueen_evo'),
         names=('Petaline', 'Petalguard', 'Bloomqueen'),
         type='GRASS', donor=4, hue=325, sat=0.50, val=1.0,
         donor_ids=('ogglord', 'oggtitan_mid', 'oggmonarch_evo')),
    dict(ids=('voltmouse', 'amperat_mid', 'galvatail_evo'),
         names=('Voltmouse', 'Amperat', 'Galvatail'),
         type='ELECTRIC', donor=13, hue=48, sat=0.80, val=1.0,
         donor_ids=('tigrub', 'tigrunt_mid', 'tigrubex_evo')),
    dict(ids=('stonepup', 'boulderhound_mid', 'granitewolf_evo'),
         names=('Stonepup', 'Boulderhound', 'Granitewolf'),
         type='EARTH', donor=3, hue=215, sat=0.35, val=1.0,
         donor_ids=('snoutling', 'snoutbrute_mid', 'snoutzar_evo')),
    dict(ids=('wisplet', 'phantorb_mid', 'spectralord_evo'),
         names=('Wisplet', 'Phantorb', 'Spectralord'),
         type='NORMAL', donor=5, hue=200, sat=0.12, val=1.15,
         donor_ids=('rollpup', 'tumblehide_mid', 'rollodon_evo')),
]


def extract_stage_block(src, donor_line, stage):
    col0, row0 = block_origin(donor_line, stage)
    block = Image.new('RGBA', (BLOCK * CELL, BLOCK * CELL), (0, 0, 0, 0))
    for d in range(BLOCK):
        for f in range(BLOCK):
            c, r = col0 + f, row0 + d
            frame = src.crop((c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL))
            block.paste(frame, (f * CELL, d * CELL))
    return block


def build_remix_sheet(src, start_index):
    """Returns (sheet_image, [(species_id, tower_index), ...]) for all 45
    monsters, start_index continuing on from the pack's own towerIndex range."""
    monsters = []  # (species_id, block_image)
    for chain in REMIX_CHAINS:
        for stage, species_id in enumerate(chain['ids']):
            block = extract_stage_block(src, chain['donor'], stage)
            block = recolor_colorize(block, chain['hue'], chain['sat'], chain['val'])
            monsters.append((species_id, block))

    sheet = Image.new('RGBA', (BLOCK * CELL, len(monsters) * BLOCK * CELL), (0, 0, 0, 0))
    index = []
    for m, (species_id, block) in enumerate(monsters):
        sheet.paste(block, (0, m * BLOCK * CELL))
        index.append((species_id, start_index + m))
    return sheet, index


if __name__ == '__main__':
    import sys
    REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    ASSETS = os.path.join(REPO, 'monster-tactics/public/assets')
    RAW = os.path.join(ASSETS, 'monster-evolution-raw')
    SRC_SHEET = os.path.join(RAW, 'monster_evolutions_01.png')

    src = Image.open(SRC_SHEET).convert('RGBA')
    sheet, index = build_remix_sheet(src, start_index=54)

    out_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out_dir, exist_ok=True)
    sheet.save(os.path.join(out_dir, 'remix_only.png'))
    for species_id, idx in index:
        print(f'  {species_id}: {idx}')
    print(f'\n{len(index)} remix monsters, indices {index[0][1]}-{index[-1][1]}')
