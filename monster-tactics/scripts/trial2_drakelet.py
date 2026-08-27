import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pixel_art_lib import K, rows16, render, check_connected, check_sprite_ranges

# Distinct flat color regions per body part (not one smooth body-wide
# gradient), asymmetric horns, high-contrast eyes - same lessons as the
# last trial. This time every appendage (horn/arm/leg) is drawn with its
# base row sharing a touching column with the part it attaches to, checked
# programmatically with check_connected before ever rendering.
G1 = (74, 120, 60, 255)
G2 = (46, 84, 40, 255)
G3 = (128, 176, 96, 255)
C1 = (224, 204, 164, 255)
C2 = (184, 160, 120, 255)
H1 = (196, 184, 152, 255)
H2 = (146, 134, 106, 255)
E = (255, 176, 40, 255)

palette = {'K': K, 'a': G1, 'b': G2, 'c': G3, 'd': C1, 'e': C2, 'f': H1, 'g': H2, 'x': E}

specs = [{} for _ in range(16)]

# left horn: rows 0-2, base at row2 cols4-5 touches head top (row3 col4-5)
specs[0] = {4: 'K'}
specs[1] = {3: 'K', 4: 'f', 5: 'K'}
specs[2] = {3: 'K', 4: 'g', 5: 'K'}
# right horn: smaller/asymmetric, rows 1-2, base at row2 cols10-11 touches head (row3 col10-11)
specs[1] = {**specs[1], 10: 'K', 11: 'K'}
specs[2] = {**specs[2], 10: 'K', 11: 'g'}

# head top row (row3) - touches both horn bases directly above (cols4-5, 10-11)
specs[3] = {4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K'}
specs[4] = {3: 'K', 4: 'c', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'c', 12: 'K'}
# eyes (asymmetric height - left eye 1 row higher than right)
specs[5] = {3: 'K', 4: 'a', 5: 'x', 6: 'K', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K'}
specs[6] = {3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'K', 9: 'x', 10: 'a', 11: 'a', 12: 'K'}
specs[7] = {3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K'}
# snout narrows, dark nostril dots
specs[8] = {4: 'K', 5: 'b', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'b', 11: 'K'}
specs[9] = {5: 'K', 6: 'b', 7: 'K', 8: 'K', 9: 'b', 10: 'K'}

# body: row10 shares cols5-10 with the snout bottom (row9) directly above it
specs[10] = {4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K'}
# belly patch (distinct flat color, not a shade of body green)
specs[11] = {3: 'K', 4: 'a', 5: 'd', 6: 'd', 7: 'd', 8: 'd', 9: 'd', 10: 'a', 11: 'K'}
specs[12] = {2: 'K', 3: 'a', 4: 'd', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'd', 10: 'a', 11: 'K'}

# arms: base row (13) shares col2 with body row12's col2/3 above it
specs[13] = {1: 'K', 2: 'b', 3: 'K', 4: 'b', 5: 'd', 6: 'e', 7: 'e', 8: 'd', 9: 'b', 10: 'K', 11: 'a', 12: 'K'}
specs[14] = {1: 'K', 2: 'g', 3: 'K', 5: 'K', 6: 'b', 7: 'b', 8: 'K', 10: 'K', 11: 'g', 12: 'K'}
# legs: base row (15) shares cols with row14's leg columns directly above
specs[15] = {5: 'K', 6: 'K', 7: 'K', 10: 'K', 11: 'K'}

rows = rows16(specs)

if not check_connected(rows, 'drakelet base'):
    sys.exit(1)

img = render(rows, palette)
check_sprite_ranges(img, 'base')

out_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(out_dir, exist_ok=True)
from PIL import Image
img.resize((16 * 20, 16 * 20), Image.NEAREST).save(os.path.join(out_dir, 'drakelet_v2.png'))
print('wrote drakelet_v2.png')
