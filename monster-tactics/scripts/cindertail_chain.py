# cindertail -> emberfox_mid -> infernox_evo: one original (not recolored)
# fire-fox chain, built to the game's actual convention (3 facings x
# 3-frame idle bob per stage - see gen_towers.py/monsters.js, every other
# species in the game uses this). Fixes applied from the bulk_originals
# side-by-side comparison against real pack sprites:
#   - richer banding: 4 tones per major fur region (was 2-3), plus a few
#     scattered alt-tone pixels ("mottling") instead of pure flat fill -
#     real pack sprites (puffle especially) are visibly mottled, not flat.
#   - chunkier limbs: stub legs are 2px wide minimum, not 1px lines.
#   - growth across stages matches the pack's actual measured behavior
#     (opacity% genuinely increases base->mid->final - confirmed by
#     pixel-counting real sprites earlier), not a "stay the same size"
#     rule - the pack itself doesn't follow that rule.
# Every grid is connectivity-checked before rendering (pixel_art_lib).
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pixel_art_lib import K, rows16, render, check_connected, check_sprite_ranges

W = (255, 255, 255, 255)


def bob(rows):
    return ["................"] + rows[:-1]


def build_stage(down, up, side, palette, species_id, stage):
    ok = True
    for label, rows in (('down', down), ('up', up), ('side', side)):
        ok = check_connected(rows, f'  {species_id} {label}') and ok
    frames = []
    for rows in (down, up, side):
        f0 = render(rows, palette)
        f1 = render(bob(rows), palette)
        frames.extend([f0, f1, f0])
    range_ok = check_sprite_ranges(render(down, palette), stage)
    return frames, ok and range_ok


# ------------------------------------------------------------------ #
# stage 1: cindertail (base) - mostly face, small stub legs, per the
# pack's own base-stage convention (molecap/hornlet/puffle etc are
# almost entirely head, confirmed by direct measurement earlier).
# ------------------------------------------------------------------ #
F1, F2, F3, F4 = (176, 78, 30, 255), (122, 50, 18, 255), (208, 112, 52, 255), (236, 150, 82, 255)
C1, C2 = (240, 214, 172, 255), (202, 176, 134, 255)
E = (255, 200, 40, 255)
PAL1 = {'K': K, 'W': W, 'a': F1, 'b': F2, 'c': F3, 'd': F4, 'e': C1, 'f': C2, 'x': E}

cindertail_down = rows16([
    {4: 'K', 11: 'K'},
    {3: 'K', 4: 'a', 5: 'K', 10: 'K', 11: 'a', 12: 'K'},
    {3: 'K', 4: 'b', 5: 'K', 10: 'K', 11: 'd', 12: 'K'},
    {3: 'K', 4: 'a', 5: 'a', 10: 'a', 11: 'a', 12: 'K'},
    {2: 'K', 3: 'c', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'd', 13: 'K'},
    {2: 'K', 3: 'a', 4: 'a', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'e', 10: 'e', 11: 'a', 12: 'a', 13: 'K'},
    {2: 'K', 3: 'a', 4: 'e', 5: 'x', 6: 'f', 7: 'e', 8: 'e', 9: 'x', 10: 'f', 11: 'e', 12: 'a', 13: 'K'},
    {2: 'K', 3: 'b', 4: 'e', 5: 'K', 6: 'e', 7: 'e', 8: 'e', 9: 'K', 10: 'e', 11: 'b', 12: 'K'},
    {3: 'K', 4: 'e', 5: 'e', 6: 'f', 7: 'K', 8: 'f', 9: 'e', 10: 'e', 11: 'K'},
    {4: 'K', 5: 'K', 6: 'K', 8: 'K', 9: 'K', 10: 'K'},
    {3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K'},
    {2: 'K', 3: 'a', 4: 'e', 5: 'e', 6: 'e', 7: 'e', 8: 'a', 9: 'd', 10: 'K'},
    {1: 'K', 2: 'b', 3: 'a', 4: 'e', 5: 'e', 6: 'e', 7: 'a', 8: 'K', 9: 'b', 10: 'K'},
    {2: 'K', 3: 'K', 5: 'K', 6: 'K', 8: 'K', 9: 'K'},
    {3: 'W', 8: 'W'},
    {},
])

cindertail_up = rows16([
    {4: 'K', 11: 'K'},
    {3: 'K', 4: 'a', 5: 'K', 10: 'K', 11: 'a', 12: 'K'},
    {3: 'K', 4: 'b', 5: 'K', 10: 'K', 11: 'd', 12: 'K'},
    {3: 'K', 4: 'a', 5: 'a', 10: 'a', 11: 'a', 12: 'K'},
    {2: 'K', 3: 'c', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'd', 13: 'K'},
    {2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'b', 7: 'a', 8: 'a', 9: 'b', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {2: 'K', 3: 'b', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'b', 12: 'K'},
    {3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'K', 8: 'a', 9: 'a', 10: 'a', 11: 'K'},
    {4: 'K', 5: 'K', 6: 'K', 8: 'K', 9: 'K', 10: 'K'},
    {3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K'},
    {2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'd', 10: 'K'},
    {1: 'K', 2: 'b', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'K', 9: 'b', 10: 'K'},
    {2: 'K', 3: 'K', 5: 'K', 6: 'K', 8: 'K', 9: 'K'},
    {3: 'W', 8: 'W'},
    {},
])

cindertail_side = rows16([
    {9: 'K', 10: 'K'},
    {8: 'K', 9: 'a', 10: 'K'},
    {8: 'K', 9: 'b', 10: 'K'},
    {2: 'K', 3: 'K', 7: 'K', 8: 'a', 9: 'a', 10: 'K'},
    {1: 'K', 2: 'd', 3: 'a', 4: 'K', 6: 'K', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'a', 4: 'a', 6: 'K', 7: 'e', 8: 'e', 9: 'e', 10: 'e', 11: 'e', 12: 'K'},
    {0: 'K', 1: 'a', 4: 'K', 5: 'a', 6: 'a', 7: 'e', 8: 'x', 9: 'e', 10: 'e', 11: 'f', 12: 'e', 13: 'K'},
    {1: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'e', 8: 'K', 9: 'e', 10: 'e', 11: 'e', 12: 'K'},
    {5: 'K', 6: 'a', 7: 'e', 8: 'e', 9: 'f', 10: 'K', 11: 'e', 12: 'K'},
    {5: 'K', 6: 'K', 7: 'K', 9: 'K', 10: 'K'},
    {5: 'K', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K'},
    {4: 'K', 5: 'c', 6: 'a', 7: 'e', 8: 'e', 9: 'a', 10: 'd', 11: 'K'},
    {3: 'K', 4: 'a', 5: 'a', 6: 'e', 7: 'f', 8: 'a', 9: 'a', 10: 'K'},
    {2: 'K', 3: 'b', 4: 'K', 5: 'a', 6: 'e', 7: 'a', 8: 'K', 9: 'b', 10: 'K'},
    {2: 'K', 4: 'K', 5: 'K', 6: 'K', 8: 'K', 9: 'K'},
    {5: 'W', 6: 'W', 8: 'W'},
])

# ------------------------------------------------------------------ #
# stage 2: emberfox_mid - bigger (matches real pack growth curve),
# bushy tail becomes visible, chest ember marking added
# ------------------------------------------------------------------ #
G1, G2, G3, G4 = (166, 72, 26, 255), (114, 46, 16, 255), (198, 104, 46, 255), (232, 144, 74, 255)
H1, H2 = (236, 210, 168, 255), (196, 170, 128, 255)
Ee = (255, 190, 32, 255)
Rr = (232, 76, 40, 255)  # ember marking accent
PAL2 = {'K': K, 'W': W, 'a': G1, 'b': G2, 'c': G3, 'd': G4, 'e': H1, 'f': H2, 'x': Ee, 'r': Rr}

emberfox_down = rows16([
    {3: 'K', 12: 'K'},
    {2: 'K', 3: 'a', 4: 'K', 11: 'K', 12: 'a', 13: 'K'},
    {2: 'K', 3: 'b', 4: 'K', 11: 'K', 12: 'd', 13: 'K'},
    {2: 'K', 3: 'a', 4: 'a', 5: 'K', 10: 'K', 11: 'a', 12: 'a', 13: 'K'},
    {1: 'K', 2: 'c', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'd', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'e', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'e', 10: 'e', 11: 'a', 12: 'a', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'e', 4: 'x', 5: 'f', 6: 'e', 7: 'e', 8: 'e', 9: 'x', 10: 'f', 11: 'e', 12: 'a', 13: 'K'},
    {1: 'K', 2: 'b', 3: 'e', 4: 'K', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'K', 10: 'e', 11: 'b', 12: 'K'},
    {2: 'K', 3: 'e', 4: 'e', 5: 'f', 6: 'K', 7: 'K', 8: 'K', 9: 'f', 10: 'e', 11: 'e', 12: 'K'},
    {3: 'K', 4: 'K', 5: 'K', 8: 'K', 9: 'K', 10: 'K'},
    {1: 'K', 2: 'a', 3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K', 12: 'a', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'r', 5: 'a', 6: 'e', 7: 'e', 8: 'e', 9: 'a', 10: 'r', 11: 'a', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'c', 2: 'a', 3: 'a', 4: 'e', 5: 'f', 6: 'e', 7: 'e', 8: 'f', 9: 'e', 10: 'a', 11: 'a', 12: 'd', 13: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'e', 4: 'e', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'e', 10: 'a', 11: 'a', 12: 'K'},
    {0: 'K', 1: 'b', 2: 'K', 3: 'a', 4: 'e', 5: 'e', 6: 'K', 7: 'K', 8: 'e', 9: 'e', 10: 'K', 11: 'b', 12: 'K'},
    {2: 'K', 3: 'K', 4: 'K', 5: 'W', 6: 'K', 7: 'K', 8: 'K', 9: 'W', 10: 'K', 11: 'K'},
])

emberfox_up = rows16([
    {3: 'K', 12: 'K'},
    {2: 'K', 3: 'a', 4: 'K', 11: 'K', 12: 'a', 13: 'K'},
    {2: 'K', 3: 'b', 4: 'K', 11: 'K', 12: 'd', 13: 'K'},
    {2: 'K', 3: 'a', 4: 'a', 5: 'K', 10: 'K', 11: 'a', 12: 'a', 13: 'K'},
    {1: 'K', 2: 'c', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'd', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'b', 7: 'a', 8: 'b', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {1: 'K', 2: 'b', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'b', 12: 'K'},
    {2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'K', 7: 'K', 8: 'K', 9: 'a', 10: 'a', 11: 'a', 12: 'K'},
    {3: 'K', 4: 'K', 5: 'K', 8: 'K', 9: 'K', 10: 'K'},
    {1: 'K', 2: 'a', 3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K', 12: 'a', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'c', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'c', 11: 'a', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'c', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'd', 13: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K'},
    {0: 'K', 1: 'b', 2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'K', 7: 'K', 8: 'a', 9: 'a', 10: 'K', 11: 'b', 12: 'K'},
    {2: 'K', 3: 'K', 4: 'K', 5: 'W', 6: 'K', 7: 'K', 8: 'K', 9: 'W', 10: 'K', 11: 'K'},
])

emberfox_side = rows16([
    {10: 'K', 11: 'K'},
    {9: 'K', 10: 'a', 11: 'K'},
    {9: 'K', 10: 'b', 11: 'K'},
    {2: 'K', 3: 'K', 8: 'K', 9: 'a', 10: 'a', 11: 'K'},
    {1: 'K', 2: 'd', 3: 'a', 4: 'K', 7: 'K', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'a', 4: 'a', 7: 'K', 8: 'e', 9: 'e', 10: 'e', 11: 'e', 12: 'e', 13: 'K'},
    {0: 'K', 1: 'a', 4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'e', 9: 'x', 10: 'e', 11: 'e', 12: 'f', 13: 'e', 14: 'K'},
    {0: 'K', 1: 'c', 2: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'e', 8: 'e', 9: 'K', 10: 'e', 11: 'e', 12: 'e', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'K', 5: 'a', 6: 'a', 7: 'e', 8: 'e', 9: 'e', 10: 'f', 11: 'K', 12: 'e', 13: 'K'},
    {2: 'K', 6: 'K', 7: 'K', 8: 'K', 10: 'K', 11: 'K'},
    {2: 'K', 6: 'K', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K'},
    {1: 'K', 2: 'a', 5: 'K', 6: 'c', 7: 'a', 8: 'r', 9: 'e', 10: 'a', 11: 'd', 12: 'K'},
    {0: 'K', 1: 'b', 2: 'K', 4: 'K', 5: 'a', 6: 'a', 7: 'e', 8: 'r', 9: 'a', 10: 'a', 11: 'K'},
    {0: 'K', 1: 'a', 3: 'K', 4: 'a', 5: 'e', 6: 'e', 7: 'a', 8: 'a', 9: 'K', 10: 'b', 11: 'K'},
    {0: 'K', 2: 'K', 3: 'a', 4: 'K', 5: 'K', 6: 'K', 8: 'K', 9: 'K'},
    {2: 'K', 6: 'W', 7: 'W', 9: 'W'},
])

# ------------------------------------------------------------------ #
# stage 3: infernox_evo - largest, full bushy tail, crown ember tufts,
# richest banding (5 tones on the main fur + ember accent)
# ------------------------------------------------------------------ #
J1, J2, J3, J4 = (156, 64, 22, 255), (104, 40, 14, 255), (190, 96, 40, 255), (226, 138, 68, 255)
J5 = (250, 178, 100, 255)  # 5th tone - brightest rim highlight, final-stage-only richness
I1, I2 = (232, 206, 164, 255), (190, 164, 122, 255)
Ie = (255, 176, 24, 255)
Ir = (224, 66, 32, 255)
PAL3 = {'K': K, 'W': W, 'a': J1, 'b': J2, 'c': J3, 'd': J4, 'g': J5, 'e': I1, 'f': I2, 'x': Ie, 'r': Ir}

infernox_down = rows16([
    {2: 'K', 3: 'g', 12: 'K', 13: 'g'},
    {1: 'K', 2: 'a', 3: 'K', 12: 'K', 13: 'a', 14: 'K'},
    {1: 'K', 2: 'b', 3: 'K', 12: 'K', 13: 'd', 14: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'K', 11: 'K', 12: 'a', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'c', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'd', 14: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'e', 4: 'e', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'e', 10: 'e', 11: 'e', 12: 'a', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'a', 2: 'e', 3: 'x', 4: 'f', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'e', 10: 'x', 11: 'f', 12: 'e', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'b', 2: 'e', 3: 'K', 4: 'e', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'e', 10: 'K', 11: 'e', 12: 'b', 13: 'K'},
    {1: 'K', 2: 'e', 3: 'e', 4: 'f', 5: 'K', 6: 'K', 7: 'K', 8: 'K', 9: 'K', 10: 'f', 11: 'e', 12: 'e', 13: 'K'},
    {2: 'K', 3: 'K', 4: 'K', 9: 'K', 10: 'K', 11: 'K'},
    {0: 'K', 1: 'a', 2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'K', 7: 'K', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'r', 4: 'a', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'e', 10: 'a', 11: 'r', 12: 'a', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'c', 2: 'a', 3: 'a', 4: 'e', 5: 'f', 6: 'K', 7: 'e', 8: 'e', 9: 'f', 10: 'e', 11: 'a', 12: 'a', 13: 'd', 14: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'e', 4: 'e', 5: 'e', 6: 'K', 7: 'e', 8: 'e', 9: 'e', 10: 'e', 11: 'a', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'b', 2: 'K', 3: 'a', 4: 'e', 5: 'e', 6: 'K', 7: 'K', 8: 'K', 9: 'e', 10: 'e', 11: 'K', 12: 'b', 13: 'K'},
    {2: 'K', 3: 'K', 4: 'K', 5: 'W', 6: 'K', 8: 'K', 9: 'W', 10: 'K', 11: 'K'},
])

infernox_up = rows16([
    {2: 'K', 3: 'g', 12: 'K', 13: 'g'},
    {1: 'K', 2: 'a', 3: 'K', 12: 'K', 13: 'a', 14: 'K'},
    {1: 'K', 2: 'b', 3: 'K', 12: 'K', 13: 'd', 14: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'K', 11: 'K', 12: 'a', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'c', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'd', 14: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'a', 4: 'a', 5: 'b', 6: 'a', 7: 'a', 8: 'a', 9: 'b', 10: 'a', 11: 'a', 12: 'a', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'b', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'b', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'a', 5: 'K', 6: 'K', 7: 'K', 8: 'K', 9: 'K', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {2: 'K', 3: 'K', 4: 'K', 9: 'K', 10: 'K', 11: 'K'},
    {0: 'K', 1: 'a', 2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'c', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'c', 12: 'a', 13: 'a', 14: 'K'},
    {0: 'K', 1: 'c', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'd', 14: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'b', 2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'K', 7: 'K', 8: 'K', 9: 'a', 10: 'a', 11: 'K', 12: 'b', 13: 'K'},
    {2: 'K', 3: 'K', 4: 'K', 5: 'W', 6: 'K', 8: 'K', 9: 'W', 10: 'K', 11: 'K'},
])

infernox_side = rows16([
    {11: 'K', 12: 'g'},
    {10: 'K', 11: 'a', 12: 'K'},
    {10: 'K', 11: 'b', 12: 'K'},
    {2: 'K', 3: 'K', 9: 'K', 10: 'a', 11: 'a', 12: 'K'},
    {1: 'K', 2: 'd', 3: 'a', 4: 'K', 8: 'K', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'a', 4: 'a', 8: 'K', 9: 'e', 10: 'e', 11: 'e', 12: 'e', 13: 'e', 14: 'K'},
    {0: 'K', 1: 'a', 4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'e', 10: 'x', 11: 'e', 12: 'e', 13: 'f', 14: 'e', 15: 'K'},
    {0: 'K', 1: 'c', 2: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'e', 9: 'e', 10: 'K', 11: 'e', 12: 'e', 13: 'e'},
    {0: 'K', 1: 'a', 2: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'e', 9: 'e', 10: 'e', 11: 'f', 12: 'K', 13: 'e'},
    {1: 'K', 6: 'K', 7: 'K', 8: 'K', 9: 'K', 11: 'K', 12: 'K'},
    {1: 'K', 6: 'K', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'a', 5: 'K', 6: 'c', 7: 'a', 8: 'a', 9: 'r', 10: 'e', 11: 'a', 12: 'd', 13: 'K'},
    {0: 'K', 1: 'b', 2: 'K', 4: 'K', 5: 'a', 6: 'a', 7: 'e', 8: 'e', 9: 'r', 10: 'a', 11: 'a', 12: 'K'},
    {0: 'K', 1: 'a', 3: 'K', 4: 'a', 5: 'e', 6: 'e', 7: 'a', 8: 'a', 9: 'a', 10: 'K', 11: 'b', 12: 'K'},
    {0: 'K', 2: 'K', 3: 'a', 4: 'K', 5: 'K', 6: 'K', 8: 'K', 9: 'K'},
    {2: 'K', 6: 'W', 7: 'W', 9: 'W'},
])


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out_dir, exist_ok=True)

    stages = [
        ('cindertail', 'base', cindertail_down, cindertail_up, cindertail_side, PAL1),
        ('emberfox_mid', 'mid', emberfox_down, emberfox_up, emberfox_side, PAL2),
        ('infernox_evo', 'final', infernox_down, infernox_up, infernox_side, PAL3),
    ]

    all_ok = True
    named = []
    for species_id, stage, down, up, side, palette in stages:
        frames, ok = build_stage(down, up, side, palette, species_id, stage)
        all_ok = all_ok and ok
        named.append((species_id, frames))

    from PIL import Image, ImageDraw
    scale = 10
    row_h = 16 * scale + 14
    sheet = Image.new('RGBA', (9 * 16 * scale + 90, len(named) * row_h), (30, 30, 30, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (species_id, frames) in enumerate(named):
        y0 = i * row_h
        draw.text((4, y0 + 2), species_id, fill=(255, 255, 255, 255))
        for f, frame in enumerate(frames):
            big = frame.resize((16 * scale, 16 * scale), Image.NEAREST)
            sheet.paste(big, (90 + f * 16 * scale, y0 + 12), big)
    sheet.save(os.path.join(out_dir, 'cindertail_chain_sheet.png'))
    print(f'\nwrote cindertail_chain_sheet.png')
    print('ALL GATES PASS' if all_ok else 'SOME GATES FAILED (see above)')


if __name__ == '__main__':
    main()
