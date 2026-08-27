# Pilot for the next 20-chain batch: ramlet -> ramguard_mid -> ramthorn_evo,
# an EARTH ram/goat line - a concept not used by any of the 33 existing base
# species. Built at 16px to match every other live species (TOWER_BIG_SHEET
# exists but nothing uses it yet, so 16px is "the same style as the other
# monsters in the game" as asked, not the abandoned 32px detour).
#
# Applies every lesson from this session's earlier work (see
# cindertail_chain.py for the full history): connectivity-checked (every
# appendage's base row touches what it attaches to - the recurring bug in
# every prior attempt), eyes on the same row (an early asymmetry mistake),
# real oval body taper via per-row width variation (a flat-width row reads
# as a rectangular plank, not a body - the specific bug found building
# cindertail at 32px), chunky 2px+ limbs, and richer per-part banding
# instead of flat fill + one highlight/shadow.
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pixel_art_lib import K, render, check_connected, check_sprite_ranges

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
# stage 1: ramlet (base) - small goat kid, stub horns, mostly face+legs
# per the pack's own base-stage convention (measured earlier: base forms
# are ~30-50% opaque, almost entirely head).
# ------------------------------------------------------------------ #
R1, R2, R3 = (140, 122, 108, 255), (96, 82, 70, 255), (176, 156, 138, 255)
H1, H2 = (222, 210, 192, 255), (180, 168, 150, 255)
E = (255, 200, 60, 255)
PAL1 = {'K': K, 'W': W, 'a': R1, 'b': R2, 'c': R3, 'e': H1, 'f': H2, 'x': E}

# The row(...) index-dict builder (from trial_cindertail32.py) is far less
# error-prone than hand-typed strings for anything with real curvature -
# using that approach here throughout.
def row_spec(**cols):
    return {int(k): v for k, v in cols.items()}


def build_rows(specs):
    out = []
    for spec in specs:
        r = ['.'] * 16
        for idx, ch in spec.items():
            r[idx] = ch
        out.append(''.join(r))
    return out


ramlet_down = build_rows([
    row_spec(**{'3': 'K', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'c', '4': 'K', '11': 'K', '12': 'c', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'b', '4': 'K', '11': 'K', '12': 'b', '13': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'K', '10': 'K', '11': 'a', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'c', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'c', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'x', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'x', '11': 'a', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K', '11': 'a', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'e', '6': 'e', '7': 'f', '8': 'f', '9': 'e', '10': 'e', '11': 'K'}),
    row_spec(**{'5': 'K', '6': 'e', '7': 'K', '8': 'K', '9': 'e', '10': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'b', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'b', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'b', '4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K', '11': 'b', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'K', '5': 'K', '6': 'K', '9': 'K', '10': 'K', '12': 'K', '13': 'K'}),
    row_spec(**{'2': 'W', '3': 'W', '5': 'K', '6': 'K', '9': 'K', '10': 'K', '12': 'W', '13': 'W'}),
    row_spec(**{}),
])

ramlet_up = build_rows([
    row_spec(**{'3': 'K', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'c', '4': 'K', '11': 'K', '12': 'c', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'b', '4': 'K', '11': 'K', '12': 'b', '13': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'K', '10': 'K', '11': 'a', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'c', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'c', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'b', '8': 'b', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'b', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'b', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'b', '4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K', '11': 'b', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'K', '5': 'K', '6': 'K', '9': 'K', '10': 'K', '12': 'K', '13': 'K'}),
    row_spec(**{'2': 'W', '3': 'W', '5': 'K', '6': 'K', '9': 'K', '10': 'K', '12': 'W', '13': 'W'}),
    row_spec(**{}),
])

ramlet_side = build_rows([
    row_spec(**{'9': 'K', '10': 'K'}),
    row_spec(**{'8': 'K', '9': 'c', '10': 'K', '11': 'c', '12': 'K'}),
    row_spec(**{'8': 'K', '9': 'b', '10': 'K', '11': 'b', '12': 'K'}),
    row_spec(**{'7': 'K', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'6': 'K', '7': 'c', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'6': 'K', '7': 'a', '8': 'x', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'6': 'K', '7': 'a', '8': 'K', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'6': 'K', '7': 'e', '8': 'e', '9': 'f', '10': 'e', '11': 'e', '12': 'a', '13': 'K'}),
    row_spec(**{'5': 'K', '6': 'e', '7': 'K', '8': 'K', '9': 'e', '10': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'b', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'b', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'b', '4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K', '11': 'a', '12': 'b', '13': 'K'}),
    row_spec(**{'2': 'K', '4': 'K', '5': 'K', '8': 'K', '9': 'K', '10': 'K', '13': 'K'}),
    row_spec(**{'4': 'W', '5': 'W', '9': 'K', '10': 'K', '13': 'W'}),
    row_spec(**{}),
])


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out_dir, exist_ok=True)

    frames, ok = build_stage(ramlet_down, ramlet_up, ramlet_side, PAL1, 'ramlet', 'base')

    from PIL import Image, ImageDraw
    scale = 12
    img = render(ramlet_down, PAL1)
    img.resize((16 * scale, 16 * scale), Image.NEAREST).save(os.path.join(out_dir, 'ramlet_pilot.png'))
    print('wrote ramlet_pilot.png')
    print('ALL GATES PASS' if ok else 'GATES FAILED (see above)')


if __name__ == '__main__':
    main()
