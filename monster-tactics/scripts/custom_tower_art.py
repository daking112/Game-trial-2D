# Hand-authored pixel art for tower monsters beyond the Monster Evolution
# pack's 18 lines - see gen_towers.py, which appends these to towers.png
# after the pack's blocks.
#
# Each monster is three 16x16 grids (down/front, up/back, and side facing
# RIGHT - facing left is the side art flipped, the same convention the
# pack's own rows use). Grid characters index into that monster's palette;
# '.' is transparent. Rows may be written short and are padded to 16, but
# never longer (render_grid asserts).
#
# Style was matched to the pack by measuring it rather than guessing. Its
# sprites are far more compact than a naive 16x16 drawing wants to be -
# an alpha dump of rollpup/puffle showed bodies only ~9-13px wide and
# ~8-13px tall, sitting inside a clear margin - and almost all of their
# readability at this size comes from oversized eyes: a 2-wide white block
# with a dark pupil directly under it, which survives being scaled down in
# a bench slot where finer detail turns to mush. A first pass here used
# 1px eyes and filled the whole cell, and next to the pack art it read as
# a noisy blob. So: compact silhouette, generous margin, big eyes, flat
# 2-3 tone fills with the darker shade along the bottom, and near-black
# 1px outline.
#
# The 3 animation frames per facing are derived, not authored: frame 0 is
# the grid, frame 1 is the same image shifted down 1px, frame 2 is the
# grid again. At the tower idle rate (4fps) that reads as breathing, which
# suits a stationary tower better than a walk cycle would.

from PIL import Image

K = (18, 16, 24, 255)     # outline
W = (255, 255, 255, 255)  # eye white
P = (28, 24, 36, 255)     # pupil

PALETTES = {
    'zapling': {'K': K, 'W': W, 'P': (50, 55, 150, 255),
                'Y': (247, 205, 70, 255), 'D': (196, 140, 34, 255), 'O': (255, 156, 46, 255)},
    'zapfowl': {'K': K, 'W': W, 'P': (50, 55, 150, 255),
                'Y': (249, 210, 78, 255), 'D': (192, 134, 32, 255),
                'B': (86, 168, 236, 255), 'O': (255, 156, 46, 255)},
    'voltvern': {'K': K, 'W': W, 'P': (50, 55, 150, 255),
                 'Y': (250, 214, 84, 255), 'D': (188, 128, 30, 255),
                 'B': (86, 168, 236, 255), 'O': (255, 156, 46, 255)},
    'emberimp': {'K': K, 'W': W, 'P': (230, 70, 30, 255),
                 'R': (222, 76, 42, 255), 'M': (134, 36, 30, 255),
                 'O': (255, 152, 52, 255), 'F': (255, 222, 120, 255)},
    'emberbrute': {'K': K, 'W': W, 'P': (230, 70, 30, 255),
                   'R': (210, 66, 40, 255), 'M': (116, 32, 28, 255),
                   'O': (255, 152, 52, 255), 'F': (255, 222, 120, 255)},
    'cinderfiend': {'K': K, 'W': W, 'P': (230, 70, 30, 255),
                    'R': (196, 54, 38, 255), 'M': (96, 26, 26, 255),
                    'O': (255, 152, 52, 255), 'F': (255, 222, 120, 255)},
    'thornshell': {'K': K, 'W': W, 'P': (65, 155, 45, 255),
                   'G': (118, 196, 96, 255), 'E': (46, 108, 56, 255),
                   'S': (214, 234, 184, 255)},
    'thornguard': {'K': K, 'W': W, 'P': (65, 155, 45, 255),
                   'G': (112, 190, 92, 255), 'E': (44, 102, 54, 255),
                   'S': (214, 234, 184, 255), 'B': (214, 58, 70, 255)},
    'bramblemaw': {'K': K, 'W': W, 'P': (65, 155, 45, 255),
                   'G': (104, 180, 88, 255), 'E': (40, 96, 50, 255),
                   'B': (214, 58, 70, 255), 'S': (214, 234, 184, 255)},
    'mothling': {'K': K, 'W': W, 'P': (200, 45, 190, 255),
                 'C': (238, 232, 214, 255), 'A': (176, 166, 190, 255),
                 'D': (92, 84, 108, 255)},
    'duskwing': {'K': K, 'W': W, 'P': (200, 45, 190, 255),
                 'C': (214, 206, 226, 255), 'A': (140, 128, 162, 255),
                 'D': (78, 70, 96, 255), 'T': (156, 146, 186, 255)},
    'lunamoth': {'K': K, 'W': W, 'P': (200, 45, 190, 255),
                 'C': (226, 250, 244, 255), 'T': (104, 206, 194, 255),
                 'D': (66, 84, 100, 255), 'L': (252, 246, 176, 255)},
}

# (species_id, palette_key, {facing: [rows]})
CUSTOM_MONSTERS = [
    # -- ELECTRIC line: a round spark-chick that grows storm wings --
    ('zapling', 'zapling', {
        'down': [
            "......K..K......",
            ".....KOK.KOK....",
            "......KYKYK.....",
            "....KKKKKKKK....",
            "...KYYYYYYYYK...",
            "..KYYYYYYYYYYK..",
            "..KYWWYYYYWWYK..",
            "..KYWPYYYYWPYK..",
            "..KYYYYYYYYYYK..",
            "..KYYYKOOKYYYK..",
            "..KYYYYYYYYYYK..",
            "...KDYYYYYYDK...",
            "....KDDDDDDK....",
            ".....KK..KK.....",
        ],
        'up': [
            "......K..K......",
            ".....KOK.KOK....",
            "......KYKYK.....",
            "....KKKKKKKK....",
            "...KYYYYYYYYK...",
            "..KYYYYYYYYYYK..",
            "..KYYYYDDYYYYK..",
            "..KYYYDDDDYYYK..",
            "..KYYYYDDYYYYK..",
            "..KYYYYYYYYYYK..",
            "..KYYYYYYYYYYK..",
            "...KDYYYYYYDK...",
            "....KDDDDDDK....",
            ".....KK..KK.....",
        ],
        'side': [
            "......K..K......",
            ".....KOK.KOK....",
            "......KYKYK.....",
            ".....KKKKKKK....",
            "....KYYYYYYYK...",
            "...KYYYYYYYYYK..",
            "...KYYYYYWWYYK..",
            "...KYYYYYWPYKKK.",
            "...KYYYYYYYYKOOK",
            "...KYYYYYYYYYK..",
            "...KYYYYYYYYYK..",
            "....KDYYYYYDK...",
            ".....KDDDDDK....",
            "......KK.KK.....",
        ],
    }),
    ('zapfowl_mid', 'zapfowl', {
        'down': [
            "......K..K......",
            ".....KOK.KOK....",
            "......KYKYK.....",
            "...KKKKKKKKK....",
            "..KBKYYYYYYKBK..",
            "..KBKYYYYYYKBK..",
            "..KYWWYYYYWWYK..",
            "..KYWPYYYYWPYK..",
            "..KYYYYYYYYYYK..",
            "..KYYKOOOOKYYK..",
            "..KYYYYYYYYYYK..",
            "..KDYYYYYYYYDK..",
            "...KDDDDDDDDK...",
            "....KK....KK....",
        ],
        'up': [
            "......K..K......",
            ".....KOK.KOK....",
            "......KYKYK.....",
            "...KKKKKKKKK....",
            "..KBKYYYYYYKBK..",
            "..KBKYYYYYYKBK..",
            "..KYYYYDDYYYYK..",
            "..KYYYDDDDYYYK..",
            "..KYYDDDDDDYYK..",
            "..KYYYDDDDYYYK..",
            "..KYYYYYYYYYYK..",
            "..KDYYYYYYYYDK..",
            "...KDDDDDDDDK...",
            "....KK....KK....",
        ],
        'side': [
            "......K..K......",
            ".....KOK.KOK....",
            "......KYKYK.....",
            "...KKKKKKKKK....",
            "..KBKYYYYYYYK...",
            "..KBKYYYYYYYYK..",
            "..KYYYYYYWWYYK..",
            "..KYYYYYYWPYKKK.",
            "..KYYYYYYYYYKOOK",
            "..KYYYKOOOKYYK..",
            "..KYYYYYYYYYYK..",
            "..KDYYYYYYYYDK..",
            "...KDDDDDDDDK...",
            "....KK....KK....",
        ],
    }),
    ('voltvern_evo', 'voltvern', {
        'down': [
            "..K...K..K...K..",
            "..KB.KOK.KOK.BK.",
            "..KBK.KYKYK.KBK.",
            "..KBKKKKKKKKKBK.",
            "..KBKYYYYYYYKBK.",
            ".KBKYYYYYYYYYKBK",
            ".KKYWWYYYYWWYKK.",
            "..KYWPYYYYWPYK..",
            "..KYYYYYYYYYYK..",
            "..KYYKOOOOKYYK..",
            "..KYYYYYYYYYYK..",
            "..KDYYYYYYYYDK..",
            "...KDDYYYYDDK...",
            "....KKDDDDKK....",
            ".....KK..KK.....",
        ],
        'up': [
            "..K...K..K...K..",
            "..KB.KOK.KOK.BK.",
            "..KBK.KYKYK.KBK.",
            "..KBKKKKKKKKKBK.",
            "..KBKYYYYYYYKBK.",
            ".KBKYYYYYYYYYKBK",
            ".KKYYYYDDYYYYKK.",
            "..KYYYDDDDYYYK..",
            "..KYYDDDDDDYYK..",
            "..KYYYDDDDYYYK..",
            "..KYYYYDDYYYYK..",
            "..KDYYYYYYYYDK..",
            "...KDDYYYYDDK...",
            "....KKDDDDKK....",
            ".....KK..KK.....",
        ],
        'side': [
            "..K...K..K......",
            "..KB.KOK.KOK....",
            "..KBK.KYKYK.....",
            "..KBKKKKKKKK....",
            "..KBKYYYYYYYK...",
            ".KBKYYYYYYYYYK..",
            ".KKYYYYYYWWYYK..",
            "..KYYYYYYWPYKKK.",
            "..KYYYYYYYYYKOOK",
            "..KYYYKOOOKYYK..",
            "..KYYYYYYYYYYK..",
            "..KDYYYYYYYYDK..",
            "...KDDYYYYDDK...",
            "....KKDDDDKK....",
            ".....KK..KK.....",
        ],
    }),

    # -- FIRE line: a horned imp with a flame crest --
    ('emberimp', 'emberimp', {
        'down': [
            ".......KFK......",
            "......KFOFK.....",
            "...K..KOOK..K...",
            "..KMK.KOOK.KMK..",
            "..KMKKKKKKKKMK..",
            "..KMRRRRRRRRMK..",
            "..KRRRRRRRRRRK..",
            "..KRWWRRRRWWRK..",
            "..KRWPRRRRWPRK..",
            "..KRRRRRRRRRRK..",
            "..KRRRKMMKRRRK..",
            "...KMRRRRRRMK...",
            "....KMMMMMMK....",
            ".....KK..KK.....",
        ],
        'up': [
            ".......KFK......",
            "......KFOFK.....",
            "...K..KOOK..K...",
            "..KMK.KOOK.KMK..",
            "..KMKKKKKKKKMK..",
            "..KMRRRRRRRRMK..",
            "..KRRRRRRRRRRK..",
            "..KRRRMRRMRRRK..",
            "..KRRRRMMRRRRK..",
            "..KRRRMRRMRRRK..",
            "..KRRRRRRRRRRK..",
            "...KMRRRRRRMK...",
            "....KMMMMMMK....",
            ".....KK..KK.....",
        ],
        'side': [
            ".......KFK......",
            "......KFOFK.....",
            "...K..KOOK......",
            "..KMK.KOOK......",
            "..KMKKKKKKK.....",
            "..KMRRRRRRRK....",
            "..KRRRRRRRRRK...",
            "..KRRRRRRWWRK...",
            "..KRRRRRRWPRKKK.",
            "..KRRRRRRRRRKMMK",
            "..KRRRKMMKRRRK..",
            "...KMRRRRRRMK...",
            "....KMMMMMMK....",
            ".....KK..KK.....",
        ],
    }),
    ('emberbrute_mid', 'emberbrute', {
        'down': [
            "......KFK.KFK...",
            ".....KFOFKFOFK..",
            "...K..KOOKOOK.K.",
            "..KMK.KKOOKK.KMK",
            "..KMKKKKKKKKKKMK",
            "..KMRRRRRRRRRRK.",
            "..KRRRRRRRRRRRK.",
            "..KRWWRRRRWWRRK.",
            "..KRWPRRRRWPRRK.",
            "..KRRRRRRRRRRRK.",
            "..KRRKWKWKWKRRK.",
            "..KRRKKKKKKKRRK.",
            "...KMRRRRRRRMK..",
            "....KMMMMMMMK...",
            ".....KK...KK....",
        ],
        'up': [
            "......KFK.KFK...",
            ".....KFOFKFOFK..",
            "...K..KOOKOOK.K.",
            "..KMK.KKOOKK.KMK",
            "..KMKKKKKKKKKKMK",
            "..KMRRRRRRRRRRK.",
            "..KRRRRRRRRRRRK.",
            "..KRRRMRRMRRRRK.",
            "..KRRRRMMRRRRRK.",
            "..KRRRMRRMRRRRK.",
            "..KRRRRRRRRRRRK.",
            "..KRRRRRRRRRRRK.",
            "...KMRRRRRRRMK..",
            "....KMMMMMMMK...",
            ".....KK...KK....",
        ],
        'side': [
            "......KFK.KFK...",
            ".....KFOFKFOFK..",
            "...K..KOOKOOK...",
            "..KMK.KKOOKK....",
            "..KMKKKKKKKKK...",
            "..KMRRRRRRRRRK..",
            "..KRRRRRRRRRRK..",
            "..KRRRRRRRWWRK..",
            "..KRRRRRRRWPRKK.",
            "..KRRRRRRRRRRKMK",
            "..KRRKWKWKWKRRK.",
            "..KRRKKKKKKKRRK.",
            "...KMRRRRRRRMK..",
            "....KMMMMMMMK...",
            ".....KK...KK....",
        ],
    }),
    ('cinderfiend_evo', 'cinderfiend', {
        'down': [
            "..KFK..KFK..KFK.",
            ".KFOFKKFOFKKFOFK",
            ".KOOKKKOOKKKOOK.",
            "KMK.KKKOOKKK.KMK",
            "KMKKKKKKKKKKKKMK",
            "KMKRRRRRRRRRRKMK",
            ".KRRRRRRRRRRRRK.",
            ".KRWWRRRRRRWWRK.",
            ".KRWPRRRRRRWPRK.",
            ".KRRRRRRRRRRRRK.",
            ".KRRKWKWKWKRRRK.",
            ".KRRKMKMKMKRRRK.",
            ".KMRRKKKKKRRRMK.",
            "..KMMRRRRRRMMK..",
            "...KMMMMMMMMK...",
            "....KK....KK....",
        ],
        'up': [
            "..KFK..KFK..KFK.",
            ".KFOFKKFOFKKFOFK",
            ".KOOKKKOOKKKOOK.",
            "KMK.KKKOOKKK.KMK",
            "KMKKKKKKKKKKKKMK",
            "KMKRRRRRRRRRRKMK",
            ".KRRRRRRRRRRRRK.",
            ".KRRRRMRRMRRRRK.",
            ".KRRRRRMMRRRRRK.",
            ".KRRRRMRRMRRRRK.",
            ".KRRRRRRRRRRRRK.",
            ".KRRRRRRRRRRRRK.",
            ".KMRRRRRRRRRRMK.",
            "..KMMRRRRRRMMK..",
            "...KMMMMMMMMK...",
            "....KK....KK....",
        ],
        'side': [
            "..KFK..KFK......",
            ".KFOFKKFOFK.....",
            ".KOOKKKOOK......",
            "KMK.KKKOOK......",
            "KMKKKKKKKKK.....",
            "KMKRRRRRRRRK....",
            ".KRRRRRRRRRRK...",
            ".KRRRRRRRRWWRK..",
            ".KRRRRRRRRWPRKKK",
            ".KRRRRRRRRRRRKMM",
            ".KRRKWKWKWKRRRK.",
            ".KRRKMKMKMKRRK..",
            ".KMRRKKKKKRRMK..",
            "..KMMRRRRRMMK...",
            "...KMMMMMMMK....",
            "....KK...KK.....",
        ],
    }),

    # -- GRASS line: a spiked shell that opens into a bramble maw --
    ('thornshell', 'thornshell', {
        'down': [
            "..K....K....K...",
            "..KSK..KSK..KSK.",
            "..KSK.KSSK.KSK..",
            "..KSKKKSSKKKSK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEEEEEEEEEK..",
            ".KKKKKKKKKKKKK..",
            "..KGGGGGGGGGGK..",
            "..KGWWGGGGWWGK..",
            "..KGWPGGGGWPGK..",
            "..KGGGGGGGGGGK..",
            "..KGGGKEEKGGGK..",
            "...KEGGGGGGEK...",
            "....KEEEEEEK....",
            ".....KK..KK.....",
        ],
        'up': [
            "..K....K....K...",
            "..KSK..KSK..KSK.",
            "..KSK.KSSK.KSK..",
            "..KSKKKSSKKKSK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEESSEEEEEK..",
            ".KEEEEEEEEEEEK..",
            ".KKKKKKKKKKKKK..",
            "..KGGGGGGGGGGK..",
            "..KGGGGGGGGGGK..",
            "...KEGGGGGGEK...",
            "....KEEEEEEK....",
            ".....KK..KK.....",
        ],
        'side': [
            "..K....K....K...",
            "..KSK..KSK..KSK.",
            "..KSK.KSSK.KSK..",
            "..KSKKKSSKKKSK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEEEEEEEEEK..",
            ".KKKKKKKKKKKKK..",
            "..KGGGGGGGGGGK..",
            "..KGGGGGGGWWGK..",
            "..KGGGGGGGWPGKK.",
            "..KGGGGGGGGGGKEK",
            "..KGGGKEEKGGGK..",
            "...KEGGGGGGEK...",
            "....KEEEEEEK....",
            ".....KK..KK.....",
        ],
    }),
    ('thornguard_mid', 'thornguard', {
        'down': [
            "..K...K..K...K..",
            "..KSK.KSK.KSK...",
            "..KSKKKSSKKKSK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEBEEEBEEEK..",
            ".KKKKKKKKKKKKK..",
            "..KGGGGGGGGGGK..",
            "..KGWWGGGGWWGK..",
            "..KGWPGGGGWPGK..",
            "..KGGGGGGGGGGK..",
            "..KGGKEEEEKGGK..",
            "..KEGGGGGGGGEK..",
            "...KEEEEEEEEK...",
            "....KK....KK....",
        ],
        'up': [
            "..K...K..K...K..",
            "..KSK.KSK.KSK...",
            "..KSKKKSSKKKSK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEBEEEBEEEK..",
            ".KEEEEESSEEEEK..",
            ".KEEEEEEEEEEEK..",
            ".KKKKKKKKKKKKK..",
            "..KGGGGGGGGGGK..",
            "..KGGGGGGGGGGK..",
            "..KEGGGGGGGGEK..",
            "...KEEEEEEEEK...",
            "....KK....KK....",
        ],
        'side': [
            "..K...K..K...K..",
            "..KSK.KSK.KSK...",
            "..KSKKKSSKKKSK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEEEEEEEEEK..",
            ".KEEEBEEEBEEEK..",
            ".KKKKKKKKKKKKK..",
            "..KGGGGGGGGGGK..",
            "..KGGGGGGGWWGK..",
            "..KGGGGGGGWPGKK.",
            "..KGGGGGGGGGGKEK",
            "..KGGKEEEEKGGK..",
            "..KEGGGGGGGGEK..",
            "...KEEEEEEEEK...",
            "....KK....KK....",
        ],
    }),
    ('bramblemaw_evo', 'bramblemaw', {
        'down': [
            "..K.K..K..K.K...",
            ".KSKSKKSKKSKSK..",
            ".KEEEEEEEEEEEK..",
            "KEEEEBEEEBEEEEK.",
            "KEEEEEEEEEEEEEK.",
            "KEWWEEEEEEEWWEK.",
            "KEWPEEEEEEEWPEK.",
            "KEEEEEEEEEEEEEK.",
            "KEKKKKKKKKKKKEK.",
            "KEKWKWKWKWKWKEK.",
            "KEKKKKKKKKKKKEK.",
            "KEEEEEEEEEEEEEK.",
            ".KEEEBEEEBEEEK..",
            "..KEEEEEEEEEK...",
            "...KK.....KK....",
        ],
        'up': [
            "..K.K..K..K.K...",
            ".KSKSKKSKKSKSK..",
            ".KEEEEEEEEEEEK..",
            "KEEEEBEEEBEEEEK.",
            "KEEEEEEEEEEEEEK.",
            "KEEGEEEEEEEGEEK.",
            "KEEEEEGEGEEEEEK.",
            "KEEEEEEEEEEEEEK.",
            "KEEGEEEEEEEGEEK.",
            "KEEEEEGEGEEEEEK.",
            "KEEEEEEEEEEEEEK.",
            "KEEEEEEEEEEEEEK.",
            ".KEEEBEEEBEEEK..",
            "..KEEEEEEEEEK...",
            "...KK.....KK....",
        ],
        'side': [
            "..K.K..K..K.....",
            ".KSKSKKSKKSK....",
            ".KEEEEEEEEEEK...",
            "KEEEEBEEEBEEEK..",
            "KEEEEEEEEEEEEK..",
            "KEEEEEEEEEWWEK..",
            "KEEEEEEEEEWPEKK.",
            "KEEEEEEEEEEEEKEK",
            "KEKKKKKKKKKKKK..",
            "KEKWKWKWKWKWK...",
            "KEKKKKKKKKKKK...",
            "KEEEEEEEEEEEEK..",
            ".KEEEBEEEBEEK...",
            "..KEEEEEEEEK....",
            "...KK....KK.....",
        ],
    }),

    # -- NORMAL line: a fuzzy moth that becomes a pale lunar one --
    ('mothling', 'mothling', {
        'down': [
            "....K......K....",
            "...KCK....KCK...",
            "..KCCCK..KCCCK..",
            "..KCACCKKCCACK..",
            ".KCCCCKDDKCCCCK.",
            ".KCCCCKDDKCCCCK.",
            ".KCACCKWWKCCACK.",
            ".KCCCCKWPKCCCCK.",
            "..KCCCKDDKCCCK..",
            "..KCACKDDKCACK..",
            "...KCKKDDKKCK...",
            "....KKKDDKKK....",
            "......KDDK......",
            ".......KK.......",
        ],
        'up': [
            "....K......K....",
            "...KCK....KCK...",
            "..KCCCK..KCCCK..",
            "..KCACCKKCCACK..",
            ".KCCCCKDDKCCCCK.",
            ".KCCCCKDDKCCCCK.",
            ".KCACCKDDKCCACK.",
            ".KCCCCKDDKCCCCK.",
            "..KCCCKDDKCCCK..",
            "..KCACKDDKCACK..",
            "...KCKKDDKKCK...",
            "....KKKDDKKK....",
            "......KDDK......",
            ".......KK.......",
        ],
        'side': [
            "..K.......K.....",
            "..KCK....KCK....",
            ".KCCCK..KCCK....",
            ".KCACCKKCCCK....",
            "KCCCCCKDDKCK....",
            "KCACCCKDDKK.....",
            "KCCCCCKWWK......",
            "KCCACCKWPK......",
            ".KCCCCKDDK......",
            ".KCACCKDDK......",
            "..KCCKKDDK......",
            "...KKKKDDK......",
            ".....KDDK.......",
            "......KK........",
        ],
    }),
    ('duskwing_mid', 'duskwing', {
        'down': [
            "...K........K...",
            "..KCK......KCK..",
            "..KCCK....KCCK..",
            ".KCACCK..KCCACK.",
            ".KCCCCKDDKCCCCK.",
            ".KCTCCKDDKCCTCK.",
            ".KCCCCKWWKCCCCK.",
            ".KCACCKWPKCCACK.",
            ".KCCCCKDDKCCCCK.",
            "..KCCCKDDKCCCK..",
            "..KCACKDDKCACK..",
            "...KCKKDDKKCK...",
            "....KKKDDKKK....",
            "......KDDK......",
            ".......KK.......",
        ],
        'up': [
            "...K........K...",
            "..KCK......KCK..",
            "..KCCK....KCCK..",
            ".KCACCK..KCCACK.",
            ".KCCCCKDDKCCCCK.",
            ".KCTCCKDDKCCTCK.",
            ".KCCCCKDDKCCCCK.",
            ".KCACCKDDKCCACK.",
            ".KCCCCKDDKCCCCK.",
            "..KCCCKDDKCCCK..",
            "..KCACKDDKCACK..",
            "...KCKKDDKKCK...",
            "....KKKDDKKK....",
            "......KDDK......",
            ".......KK.......",
        ],
        'side': [
            "..K.......K.....",
            "..KCK....KCK....",
            ".KCCCK..KCCK....",
            ".KCACCKKCCCK....",
            "KCCCCCKDDKCK....",
            "KCTCCCKDDKK.....",
            "KCCCCCKWWK......",
            "KCCACCKWPK......",
            "KCCCCCKDDK......",
            ".KCACCKDDK......",
            "..KCCKKDDK......",
            "...KKKKDDK......",
            ".....KDDK.......",
            "......KK........",
        ],
    }),
    ('lunamoth_evo', 'lunamoth', {
        'down': [
            "...K........K...",
            "..KCK......KCK..",
            ".KCCCK....KCCCK.",
            ".KCLCCK..KCCLCK.",
            "KCCCCCKDDKCCCCCK",
            "KCLCCCKDDKCCCLCK",
            "KCCCCCKWWKCCCCCK",
            "KCTCCCKWPKCCCTCK",
            "KCCTCCKDDKCCTCCK",
            ".KCCCCKDDKCCCCK.",
            ".KCTCCKDDKCCTCK.",
            "..KCCCKDDKCCCK..",
            "...KCKKDDKKCK...",
            "....KKKDDKKK....",
            "......KDDK......",
            ".......KK.......",
        ],
        'up': [
            "...K........K...",
            "..KCK......KCK..",
            ".KCCCK....KCCCK.",
            ".KCLCCK..KCCLCK.",
            "KCCCCCKDDKCCCCCK",
            "KCLCCCKDDKCCCLCK",
            "KCCCCCKDDKCCCCCK",
            "KCTCCCKDDKCCCTCK",
            "KCCTCCKDDKCCTCCK",
            ".KCCCCKDDKCCCCK.",
            ".KCTCCKDDKCCTCK.",
            "..KCCCKDDKCCCK..",
            "...KCKKDDKKCK...",
            "....KKKDDKKK....",
            "......KDDK......",
            ".......KK.......",
        ],
        'side': [
            ".K........K.....",
            ".KCK.....KCK....",
            "KCCCK...KCCK....",
            "KCLCCK.KCCCK....",
            "KCCCCCKDDKCK....",
            "KCLCCCKDDKK.....",
            "KCCCCCKWWK......",
            "KCTCCCKWPK......",
            "KCCTCCKDDK......",
            ".KCCCCKDDK......",
            ".KCTCCKDDK......",
            "..KCCKKDDK......",
            "...KKKKDDK......",
            ".....KDDK.......",
            "......KK........",
        ],
    }),
]


def _lighten(color, factor=1.3):
    r, g, b, a = color
    return (min(255, int(r * factor)), min(255, int(g * factor)), min(255, int(b * factor)), a)


def _darken(color, factor=0.8):
    r, g, b, a = color
    return (int(r * factor), int(g * factor), int(b * factor), a)


# 4x4 ordered-dither matrix (classic Bayer pattern) - used to scatter a
# second and third tone across the main fill in a fixed, repeatable
# pattern rather than picking pixels at random, so it reads as intentional
# texture/material shading instead of noise.
_BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]


def render_grid(rows, palette, size=16):
    """One 16x16 RGBA frame from a list of row strings.

    A real alpha/color dump of the pack's own frames (Puffle, Molecap,
    Ogglord) showed two things the first style pass missed. First, their
    fill isn't two flat bands (light top, dark bottom) - it's 4-5 distinct
    tones scattered across the *whole* silhouette with overlapping
    y-ranges, patchy material texture rather than geometry; a single
    rim-light row still reads as "a flat-colored face" next to that.
    Second, and the bigger tell: Ogglord carries a solid arm-colored patch
    down each side of its lower silhouette, breaking the outline into
    "head+body with limbs" instead of one undifferentiated blob - which is
    what actually reads as a small creature instead of a floating face, not
    the shading detail alone.

    Both apply automatically, still with no per-monster tuning: whichever
    character covers the most pixels is the body color, and (1) its
    topmost pixel per column is lightened (rim-light) while the rest is
    dithered in a fixed 4x4 Bayer pattern between a light and a dark fleck
    for texture, and (2) whichever OTHER character is second-most-common
    (every line already has one - the shade/leg color used at the bottom)
    takes over the outer 1-2 pixels of the body color's own lower third on
    both sides, standing in as a visible arm/limb stripe down the
    silhouette's flanks. Eyes (W/P) and outline (K) are never touched.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    assert len(rows) <= size, f'too many rows: {len(rows)}'

    counts = {}
    for row in rows:
        for ch in row:
            if ch not in ('.', 'K', 'W', 'P'):
                counts[ch] = counts.get(ch, 0) + 1
    ranked = sorted(counts, key=counts.get, reverse=True)
    dominant = ranked[0] if ranked else None
    limb = ranked[1] if len(ranked) > 1 else None

    dom_rows = [y for y, row in enumerate(rows) for ch in row if ch == dominant] if dominant else []
    if dom_rows:
        y_top, y_bot = min(dom_rows), max(dom_rows)
        limb_band = range(y_top + round((y_bot - y_top) * 0.6), y_bot + 1)
    else:
        limb_band = range(0)

    base_color = palette[dominant] if dominant else None
    highlight = _lighten(base_color) if dominant else None
    fleck_light = _lighten(base_color, 1.15) if dominant else None
    fleck_dark = _darken(base_color, 0.72) if dominant else None
    limb_color = palette[limb] if limb else None
    lit_columns = set()

    for y, row in enumerate(rows):
        assert len(row) <= size, f'row {y} too long ({len(row)}): {row!r}'
        dom_xs = [x for x, ch in enumerate(row) if ch == dominant]
        limb_xs = set()
        if limb_color is not None and y in limb_band and len(dom_xs) >= 5:
            limb_xs = {dom_xs[0], dom_xs[1], dom_xs[-1], dom_xs[-2]}
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            color = palette[ch]
            if ch == dominant:
                if x in limb_xs:
                    color = limb_color
                elif x not in lit_columns:
                    color = highlight
                    lit_columns.add(x)
                else:
                    b = _BAYER4[y % 4][x % 4]
                    if b < 3:
                        color = fleck_dark
                    elif b >= 14:
                        color = fleck_light
            img.putpixel((x, y), color)
    return img


def render_monster(art_key, facings):
    """{facing: [frame0, frame1, frame2]} - frame 1 is a 1px-down idle bob."""
    palette = PALETTES[art_key]
    out = {}
    for facing, rows in facings.items():
        base = render_grid(rows, palette)
        bob = Image.new('RGBA', base.size, (0, 0, 0, 0))
        bob.paste(base, (0, 1))
        out[facing] = [base, bob, base]
    return out
