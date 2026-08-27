# Bulk pass of original (not recolored) monster concepts, base-stage/
# down-facing only - a fast first look at several designs before investing
# in full 3-stage x 3-facing builds for any of them. Same discipline as
# drakelet: connectivity-checked (every appendage's base row touches what
# it attaches to), eyes on the same row, distinct flat color regions per
# body part, asymmetric secondary details only.
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pixel_art_lib import K, rows16, render, check_connected, check_sprite_ranges

W = (255, 255, 255, 255)

DESIGNS = []


def add(name, palette, specs):
    DESIGNS.append((name, palette, rows16(specs)))


# ---- 1. Cindertail - small fire fox, pointy ears, bushy asymmetric tail ----
F1, F2, F3 = (216, 96, 40, 255), (168, 64, 24, 255), (240, 140, 72, 255)
FC1, FC2 = (250, 224, 180, 255)[:3] + (255,), (210, 176, 128, 255)
add('cindertail', {'K': K, 'W': W, 'a': F1, 'b': F2, 'c': F3, 'd': FC1, 'e': FC2, 'x': (255, 220, 40, 255)}, [
    {4: 'K', 11: 'K'},
    {3: 'K', 4: 'a', 5: 'K', 10: 'K', 11: 'a', 12: 'K'},
    {3: 'K', 4: 'b', 5: 'K', 10: 'K', 11: 'a', 12: 'K'},
    {4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K'},
    {3: 'K', 4: 'c', 5: 'a', 6: 'd', 7: 'd', 8: 'd', 9: 'a', 10: 'a', 11: 'c', 12: 'K'},
    {3: 'K', 4: 'a', 5: 'd', 6: 'x', 7: 'd', 8: 'x', 9: 'd', 10: 'a', 11: 'a', 12: 'K'},
    {3: 'K', 4: 'a', 5: 'd', 6: 'K', 7: 'd', 8: 'K', 9: 'd', 10: 'a', 11: 'a', 12: 'K'},
    {4: 'K', 5: 'd', 6: 'd', 7: 'e', 8: 'd', 9: 'd', 10: 'K'},
    {5: 'K', 6: 'K', 7: 'K', 8: 'K', 9: 'K'},
    {2: 'K', 3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'K'},
    {1: 'K', 2: 'c', 3: 'a', 4: 'd', 5: 'd', 6: 'd', 7: 'd', 8: 'd', 9: 'a', 10: 'a', 11: 'K'},
    {1: 'K', 2: 'a', 3: 'd', 4: 'e', 5: 'e', 6: 'e', 7: 'e', 8: 'd', 9: 'a', 10: 'K'},
    {0: 'K', 1: 'b', 2: 'K', 3: 'd', 4: 'e', 5: 'e', 6: 'e', 7: 'd', 8: 'K', 9: 'b', 10: 'K'},
    {0: 'K', 1: 'c', 2: 'K', 4: 'K', 5: 'e', 6: 'e', 7: 'K', 9: 'K', 10: 'c', 11: 'K'},
    {2: 'K', 3: 'K', 6: 'K', 7: 'K', 9: 'K', 10: 'K'},
    {},
])

# ---- 2. Bramblet - round spiky bramble ball, asymmetric thorn spikes ----
Bg1, Bg2, Bg3 = (70, 110, 44, 255), (44, 72, 26, 255), (118, 158, 76, 255)
Bt1, Bt2 = (140, 96, 56, 255), (94, 64, 36, 255)
add('bramblet', {'K': K, 'W': W, 'a': Bg1, 'b': Bg2, 'c': Bg3, 'd': Bt1, 'e': Bt2, 'x': (255, 90, 90, 255)}, [
    {7: 'K'},
    {6: 'K', 7: 'd', 8: 'K'},
    {3: 'K', 5: 'K', 8: 'K', 10: 'K', 12: 'K'},
    {3: 'a', 4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K', 12: 'a'},
    {2: 'K', 3: 'c', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'c', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'x', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'x', 11: 'a', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'e', 2: 'a', 3: 'a', 4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'K', 11: 'a', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'a', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K'},
    {2: 'K', 3: 'b', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'b', 11: 'K'},
    {3: 'K', 4: 'b', 5: 'b', 6: 'K', 7: 'K', 8: 'b', 9: 'b', 10: 'K'},
    {4: 'e', 5: 'K', 9: 'K', 10: 'd'},
    {},
    {},
    {},
    {},
])

# ---- 3. Glimmerfin - small fish, side-fin, single dorsal (asymmetric) ----
Wb1, Wb2, Wb3 = (48, 120, 168, 255), (28, 84, 128, 255), (96, 176, 216, 255)
Wf1, Wf2 = (200, 232, 244, 255), (152, 196, 220, 255)
add('glimmerfin', {'K': K, 'W': W, 'a': Wb1, 'b': Wb2, 'c': Wb3, 'd': Wf1, 'e': Wf2, 'x': (255, 220, 60, 255)}, [
    {7: 'K'},
    {6: 'K', 7: 'd', 8: 'K'},
    {2: 'K', 5: 'K', 6: 'd', 7: 'd', 8: 'd', 9: 'K'},
    {1: 'K', 2: 'd', 3: 'K', 4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'K'},
    {0: 'K', 1: 'e', 2: 'K', 4: 'K', 5: 'c', 6: 'a', 7: 'x', 8: 'a', 9: 'a', 10: 'a', 11: 'K'},
    {0: 'K', 1: 'd', 2: 'K', 4: 'K', 5: 'a', 6: 'a', 7: 'K', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K'},
    {1: 'K', 4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K'},
    {2: 'K', 3: 'K', 4: 'b', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'b', 12: 'K'},
    {3: 'K', 4: 'd', 5: 'd', 6: 'd', 7: 'd', 8: 'd', 9: 'd', 10: 'K'},
    {3: 'K', 4: 'e', 5: 'e', 6: 'e', 7: 'e', 8: 'e', 9: 'K'},
    {4: 'K', 5: 'b', 6: 'K', 7: 'K', 8: 'b', 9: 'K'},
    {},
    {},
    {},
    {},
    {},
])

# ---- 4. Duneling - small beetle/scarab, shell plates, asymmetric horn ----
Eb1, Eb2, Eb3 = (150, 120, 70, 255), (108, 82, 44, 255), (190, 160, 108, 255)
Es1, Es2 = (90, 150, 96, 255), (60, 112, 68, 255)
add('duneling', {'K': K, 'W': W, 'a': Eb1, 'b': Eb2, 'c': Eb3, 'd': Es1, 'e': Es2, 'x': (255, 60, 60, 255)}, [
    {8: 'K', 9: 'K'},
    {7: 'K', 8: 'b', 9: 'K'},
    {2: 'K', 3: 'K', 6: 'K', 7: 'a', 8: 'a', 9: 'K', 12: 'K', 13: 'K'},
    {1: 'K', 2: 'c', 3: 'K', 5: 'K', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'K', 12: 'c', 13: 'K'},
    {0: 'K', 1: 'a', 2: 'K', 4: 'K', 5: 'x', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'x', 11: 'K', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'a', 4: 'K', 5: 'K', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'K', 11: 'K', 12: 'a', 13: 'K'},
    {0: 'K', 1: 'b', 2: 'K', 3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'K', 13: 'K'},
    {2: 'K', 3: 'a', 4: 'd', 5: 'd', 6: 'a', 7: 'a', 8: 'a', 9: 'd', 10: 'd', 11: 'a', 12: 'K'},
    {2: 'K', 3: 'd', 4: 'e', 5: 'd', 6: 'a', 7: 'a', 8: 'd', 9: 'e', 10: 'd', 11: 'K'},
    {2: 'K', 3: 'd', 4: 'd', 5: 'K', 6: 'a', 7: 'a', 8: 'K', 9: 'd', 10: 'd', 11: 'K'},
    {3: 'K', 4: 'K', 6: 'K', 7: 'K', 9: 'K', 10: 'K'},
    {},
    {},
    {},
    {},
    {},
])

# ---- 5. Puffshock - round electric urchin, asymmetric spike lengths ----
Ye1, Ye2, Ye3 = (216, 176, 32, 255), (168, 132, 16, 255), (248, 216, 88, 255)
add('puffshock', {'K': K, 'W': W, 'a': Ye1, 'b': Ye2, 'c': Ye3, 'x': (72, 96, 216, 255)}, [
    {5: 'K', 10: 'K'},
    {4: 'K', 5: 'a', 10: 'a', 11: 'K'},
    {4: 'a', 5: 'K', 6: 'K', 9: 'K', 10: 'a', 11: 'K'},
    {3: 'K', 5: 'a', 6: 'a', 7: 'K', 8: 'K', 9: 'a', 10: 'a', 12: 'K'},
    {3: 'a', 4: 'K', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'K', 12: 'a'},
    {2: 'K', 3: 'c', 4: 'a', 5: 'x', 6: 'a', 7: 'a', 8: 'a', 9: 'x', 10: 'a', 11: 'a', 12: 'c', 13: 'K'},
    {1: 'K', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'K', 7: 'a', 8: 'K', 9: 'a', 10: 'a', 11: 'a', 12: 'a', 13: 'K'},
    {1: 'a', 2: 'a', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'a', 12: 'a'},
    {1: 'K', 2: 'b', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'a', 10: 'a', 11: 'b', 12: 'K'},
    {2: 'K', 3: 'b', 4: 'b', 5: 'K', 6: 'b', 7: 'b', 8: 'K', 9: 'b', 10: 'b', 11: 'K'},
    {3: 'K', 5: 'K', 6: 'K', 8: 'K', 10: 'K'},
    {},
    {},
    {},
    {},
    {},
])

# ---- 6. Cragmite - small crystal golem, asymmetric gem shard, blocky ----
St1, St2, St3 = (120, 118, 128, 255), (78, 76, 88, 255), (168, 166, 176, 255)
Gm1, Gm2 = (100, 200, 220, 255), (64, 152, 172, 255)
add('cragmite', {'K': K, 'W': W, 'a': St1, 'b': St2, 'c': St3, 'd': Gm1, 'e': Gm2, 'x': (255, 240, 120, 255)}, [
    {5: 'K'},
    {4: 'K', 5: 'e', 6: 'K'},
    {3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'K'},
    {2: 'K', 3: 'c', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'K'},
    {2: 'a', 3: 'a', 4: 'x', 5: 'a', 6: 'a', 7: 'x', 8: 'a', 9: 'K'},
    {2: 'K', 3: 'a', 4: 'K', 5: 'a', 6: 'a', 7: 'K', 8: 'a', 9: 'K'},
    {2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'a', 9: 'K'},
    {3: 'K', 4: 'b', 5: 'a', 6: 'a', 7: 'a', 8: 'b', 9: 'K'},
    {4: 'K', 5: 'b', 6: 'K', 7: 'b', 8: 'K'},
    {3: 'K', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'K'},
    {2: 'K', 3: 'b', 4: 'a', 5: 'c', 6: 'a', 7: 'b', 8: 'K'},
    {2: 'K', 3: 'a', 4: 'a', 5: 'a', 6: 'a', 7: 'a', 8: 'K'},
    {1: 'K', 2: 'b', 3: 'K', 5: 'K', 6: 'b', 7: 'K'},
    {1: 'K', 3: 'K', 6: 'K'},
    {},
    {},
])


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out_dir, exist_ok=True)
    from PIL import Image, ImageDraw

    scale = 12
    row_h = 16 * scale + 16
    sheet = Image.new('RGBA', (16 * scale + 20, len(DESIGNS) * row_h), (30, 30, 30, 255))
    draw = ImageDraw.Draw(sheet)

    all_ok = True
    for i, (name, palette, rows) in enumerate(DESIGNS):
        conn_ok = check_connected(rows, name)
        img = render(rows, palette)
        range_ok = check_sprite_ranges(img, 'base')
        all_ok = all_ok and conn_ok and range_ok

        y0 = i * row_h
        draw.text((4, y0), name, fill=(255, 255, 255, 255))
        big = img.resize((16 * scale, 16 * scale), Image.NEAREST)
        sheet.paste(big, (10, y0 + 14), big)

    sheet.save(os.path.join(out_dir, 'bulk_originals_sheet.png'))
    print(f'\nwrote bulk_originals_sheet.png')
    print('ALL GATES PASS' if all_ok else 'SOME GATES FAILED (see above)')


if __name__ == '__main__':
    main()
