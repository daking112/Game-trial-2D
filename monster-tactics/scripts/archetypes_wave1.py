# Rebuild after batch20_bases.py's parametric generator produced 19
# same-looking blobs (one shared body-construction function, differing only
# by color/width numbers, flattened every archetype into the same rounded
# shape). This file hand-designs each creature's silhouette individually,
# like ramlet_chain.py/cindertail_chain.py - the body PLAN itself differs
# per archetype (a bird has real wing shapes, a snake has no limbs at all,
# a jellyfish has trailing tentacle strands instead of legs), not just the
# palette or a width parameter.
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pixel_art_lib import K, render, check_connected, check_sprite_ranges

W = (255, 255, 255, 255)


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


# ------------------------------------------------------------------ #
# owletch - GRASS owl. Real wing shapes folded at the sides (triangular,
# distinct from a leg), ear-tufts, big round forward-facing eyes (the
# owl's whole identity), thin bird legs.
# ------------------------------------------------------------------ #
Ow1, Ow2, Ow3 = (120, 100, 60, 255), (80, 66, 38, 255), (160, 138, 90, 255)
Of1, Of2 = (222, 208, 176, 255), (182, 166, 130, 255)
Oe = (255, 210, 60, 255)
PAL_OWL = {'K': K, 'W': W, 'a': Ow1, 'b': Ow2, 'c': Ow3, 'e': Of1, 'f': Of2, 'x': Oe}

owletch_down = build_rows([
    row_spec(**{'6': 'K', '9': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'K', '8': 'K', '9': 'a', '10': 'K'}),
    row_spec(**{'5': 'K', '6': 'b', '9': 'b', '10': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'c', '5': 'a', '6': 'e', '7': 'e', '8': 'e', '9': 'e', '10': 'a', '11': 'c', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'e', '6': 'x', '7': 'K', '8': 'K', '9': 'x', '10': 'e', '11': 'a', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'e', '6': 'K', '7': 'f', '8': 'f', '9': 'K', '10': 'e', '11': 'a', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'e', '7': 'K', '8': 'K', '9': 'e', '10': 'a', '11': 'K'}),
    # folded wings: triangular arm shapes at each side, distinct from legs
    row_spec(**{'1': 'K', '2': 'a', '3': 'b', '4': 'a', '5': 'e', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'e', '11': 'a', '12': 'b', '13': 'a', '14': 'K'}),
    row_spec(**{'1': 'K', '2': 'b', '3': 'a', '4': 'K', '5': 'e', '6': 'e', '7': 'e', '8': 'e', '9': 'e', '10': 'e', '11': 'K', '12': 'a', '13': 'b', '14': 'K'}),
    row_spec(**{'2': 'K', '4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K', '13': 'K'}),
    row_spec(**{'4': 'K', '5': 'b', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'b', '11': 'K'}),
    row_spec(**{'5': 'K', '6': 'K', '9': 'K', '10': 'K'}),
    row_spec(**{'5': 'W', '6': 'K', '9': 'K', '10': 'W'}),
    row_spec(**{}),
    row_spec(**{}),
])

owletch_up = build_rows([
    row_spec(**{'6': 'K', '9': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'K', '8': 'K', '9': 'a', '10': 'K'}),
    row_spec(**{'5': 'K', '6': 'b', '9': 'b', '10': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'c', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'c', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'b', '8': 'b', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'1': 'K', '2': 'a', '3': 'b', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'b', '13': 'a', '14': 'K'}),
    row_spec(**{'1': 'K', '2': 'b', '3': 'a', '4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K', '12': 'a', '13': 'b', '14': 'K'}),
    row_spec(**{'2': 'K', '4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K', '13': 'K'}),
    row_spec(**{'4': 'K', '5': 'b', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'b', '11': 'K'}),
    row_spec(**{'5': 'K', '6': 'K', '9': 'K', '10': 'K'}),
    row_spec(**{'5': 'W', '6': 'K', '9': 'K', '10': 'W'}),
    row_spec(**{}),
    row_spec(**{}),
])

owletch_side = build_rows([
    row_spec(**{'8': 'K', '10': 'K'}),
    row_spec(**{'7': 'K', '8': 'a', '9': 'K', '10': 'a', '11': 'K'}),
    row_spec(**{'7': 'K', '8': 'b', '11': 'b', '12': 'K'}),
    row_spec(**{'6': 'K', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'5': 'K', '6': 'c', '7': 'a', '8': 'e', '9': 'e', '10': 'e', '11': 'a', '12': 'a', '13': 'c', '14': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'e', '8': 'x', '9': 'K', '10': 'e', '11': 'e', '12': 'a', '13': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'e', '8': 'K', '9': 'f', '10': 'e', '11': 'a', '12': 'K'}),
    row_spec(**{'6': 'K', '7': 'a', '8': 'e', '9': 'K', '10': 'e', '11': 'a', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'b', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'b', '4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'3': 'K', '5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'5': 'K', '6': 'b', '7': 'a', '8': 'a', '9': 'a', '10': 'b', '11': 'K'}),
    row_spec(**{'6': 'K', '7': 'K', '10': 'K', '11': 'K'}),
    row_spec(**{'6': 'W', '7': 'K', '10': 'K', '11': 'W'}),
    row_spec(**{}),
    row_spec(**{}),
])

# ------------------------------------------------------------------ #
# viperling - EARTH desert snake. No limbs at all - a genuinely different
# body plan (elongated horizontal S-curve, tapering to a point at both
# ends), not a round body with legs subtracted.
# ------------------------------------------------------------------ #
V1, V2, V3 = (170, 140, 80, 255), (120, 96, 50, 255), (200, 172, 110, 255)
Vb1, Vb2 = (224, 200, 152, 255), (188, 164, 116, 255)
Vx = (60, 200, 90, 255)
PAL_VIPER = {'K': K, 'W': W, 'a': V1, 'b': V2, 'c': V3, 'e': Vb1, 'f': Vb2, 'x': Vx}

viperling_down = build_rows([
    row_spec(**{}),
    row_spec(**{'6': 'K', '9': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'K', '8': 'K', '9': 'a', '10': 'K'}),
    row_spec(**{'4': 'K', '5': 'c', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'c', '11': 'K'}),
    row_spec(**{'4': 'a', '5': 'a', '6': 'x', '7': 'a', '8': 'a', '9': 'x', '10': 'a', '11': 'a'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'K', '7': 'e', '8': 'e', '9': 'K', '10': 'a', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'b', '5': 'a', '6': 'a', '7': 'e', '8': 'e', '9': 'a', '10': 'a', '11': 'b', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'b', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'b', '11': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K'}),
    row_spec(**{'6': 'K', '7': 'a', '8': 'a', '9': 'K'}),
    row_spec(**{'7': 'K', '8': 'K'}),
    row_spec(**{}), row_spec(**{}), row_spec(**{}),
])

viperling_up = build_rows([
    row_spec(**{}),
    row_spec(**{'6': 'K', '9': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'K', '8': 'K', '9': 'a', '10': 'K'}),
    row_spec(**{'4': 'K', '5': 'c', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'c', '11': 'K'}),
    row_spec(**{'4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'b', '8': 'b', '9': 'a', '10': 'a', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'b', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'b', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'b', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'b', '11': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K'}),
    row_spec(**{'6': 'K', '7': 'a', '8': 'a', '9': 'K'}),
    row_spec(**{'7': 'K', '8': 'K'}),
    row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}),
])

viperling_side = build_rows([
    row_spec(**{}),
    row_spec(**{}),
    row_spec(**{}),
    row_spec(**{}),
    row_spec(**{'12': 'K'}),
    row_spec(**{'11': 'K', '12': 'a', '13': 'K'}),
    row_spec(**{'10': 'K', '11': 'a', '12': 'x', '13': 'a', '14': 'K'}),
    row_spec(**{'9': 'K', '10': 'a', '11': 'K', '12': 'a', '13': 'a', '14': 'a', '15': 'K'}),
    row_spec(**{'8': 'K', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'a', '14': 'a', '15': 'K'}),
    row_spec(**{'3': 'K', '4': 'c', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'a', '14': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'a', '14': 'b', '15': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'3': 'K', '4': 'b', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K'}),
    row_spec(**{'5': 'K', '6': 'K', '7': 'K', '8': 'K'}),
    row_spec(**{}),
])

# ------------------------------------------------------------------ #
# jellitide - WATER jellyfish. Domed bell top, no legs at all -
# trailing tentacle STRANDS (thin, single-pixel-wide, several of them,
# each individually attached to the bell) instead.
# ------------------------------------------------------------------ #
J1, J2, J3 = (80, 150, 200, 255), (50, 110, 160, 255), (140, 200, 230, 255)
Jx = (255, 210, 80, 255)
PAL_JELLY = {'K': K, 'W': W, 'a': J1, 'b': J2, 'c': J3, 'x': Jx}

jellitide_down = build_rows([
    row_spec(**{'6': 'K', '7': 'K', '8': 'K', '9': 'K'}),
    row_spec(**{'4': 'K', '5': 'c', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'c', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'x', '7': 'a', '8': 'a', '9': 'x', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'b', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'b', '13': 'K'}),
    row_spec(**{'3': 'K', '4': 'K', '6': 'K', '9': 'K', '11': 'K', '12': 'K'}),
    row_spec(**{'3': 'a', '4': 'K', '6': 'a', '7': 'K', '9': 'K', '11': 'K', '12': 'a'}),
    row_spec(**{'4': 'K', '6': 'a', '7': 'K', '9': 'a', '12': 'K'}),
    row_spec(**{'4': 'a', '6': 'K', '9': 'K', '12': 'a'}),
    row_spec(**{'4': 'K', '9': 'a', '12': 'K'}),
    row_spec(**{'9': 'K'}),
    row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}),
])

jellitide_up = build_rows([
    row_spec(**{'6': 'K', '7': 'K', '8': 'K', '9': 'K'}),
    row_spec(**{'4': 'K', '5': 'c', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'c', '11': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'b', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'b', '13': 'K'}),
    row_spec(**{'3': 'K', '4': 'K', '6': 'K', '9': 'K', '11': 'K', '12': 'K'}),
    row_spec(**{'3': 'a', '4': 'K', '6': 'a', '7': 'K', '9': 'K', '11': 'K', '12': 'a'}),
    row_spec(**{'4': 'K', '6': 'a', '7': 'K', '9': 'a', '12': 'K'}),
    row_spec(**{'4': 'a', '6': 'K', '9': 'K', '12': 'a'}),
    row_spec(**{'4': 'K', '9': 'a', '12': 'K'}),
    row_spec(**{'9': 'K'}),
    row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}),
])

jellitide_side = build_rows([
    row_spec(**{'7': 'K', '8': 'K', '9': 'K', '10': 'K'}),
    row_spec(**{'5': 'K', '6': 'c', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'c', '12': 'K'}),
    row_spec(**{'4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'x', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'a', '14': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'a', '14': 'K'}),
    row_spec(**{'3': 'K', '4': 'b', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'b', '14': 'K'}),
    row_spec(**{'4': 'K', '5': 'K', '7': 'K', '10': 'K', '12': 'K', '13': 'K'}),
    row_spec(**{'4': 'a', '5': 'K', '7': 'a', '8': 'K', '10': 'K', '12': 'a', '13': 'K'}),
    row_spec(**{'5': 'K', '7': 'a', '8': 'K', '10': 'a', '13': 'K'}),
    row_spec(**{'5': 'a', '7': 'K', '10': 'K', '13': 'a'}),
    row_spec(**{'5': 'K', '10': 'a', '13': 'K'}),
    row_spec(**{'10': 'K'}),
    row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}),
])

# ------------------------------------------------------------------ #
# crabkin - WATER crab. Wide flat shell, two prominent pincer-claws
# extending sideways ATTACHED DIRECTLY to the shell's own edge row (not
# a floating decor row above), short scuttling legs along the bottom.
# ------------------------------------------------------------------ #
C1, C2, C3 = (200, 90, 70, 255), (150, 60, 46, 255), (230, 130, 108, 255)
Cx = (255, 240, 100, 255)
PAL_CRAB = {'K': K, 'W': W, 'a': C1, 'b': C2, 'c': C3, 'x': Cx}

crabkin_down = build_rows([
    row_spec(**{}),
    row_spec(**{'6': 'K', '7': 'c', '8': 'c', '9': 'K'}),
    row_spec(**{'5': 'K', '6': 'x', '7': 'a', '8': 'a', '9': 'x', '10': 'K'}),
    row_spec(**{'0': 'K', '1': 'a', '2': 'K', '4': 'K', '5': 'c', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'c', '11': 'K', '13': 'K', '14': 'a', '15': 'K'}),
    row_spec(**{'0': 'K', '1': 'b', '2': 'K', '3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K', '13': 'K', '14': 'b', '15': 'K'}),
    row_spec(**{'1': 'K', '3': 'K', '4': 'b', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'b', '12': 'K', '14': 'K'}),
    row_spec(**{'3': 'K', '4': 'K', '5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K', '11': 'K', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'K', '6': 'K', '9': 'K', '11': 'K', '12': 'a', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'K', '11': 'K', '12': 'a', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'K', '12': 'K', '13': 'K'}),
    row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}),
])

crabkin_up = build_rows([
    row_spec(**{}),
    row_spec(**{'6': 'K', '7': 'K', '8': 'K', '9': 'K'}),
    row_spec(**{'5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K'}),
    row_spec(**{'0': 'K', '1': 'a', '2': 'K', '4': 'K', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K', '13': 'K', '14': 'a', '15': 'K'}),
    row_spec(**{'0': 'K', '1': 'b', '2': 'K', '3': 'K', '4': 'a', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'K', '13': 'K', '14': 'b', '15': 'K'}),
    row_spec(**{'1': 'K', '3': 'K', '4': 'b', '5': 'a', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'b', '12': 'K', '14': 'K'}),
    row_spec(**{'3': 'K', '4': 'K', '5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'K', '11': 'K', '12': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'K', '6': 'K', '9': 'K', '11': 'K', '12': 'a', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'K', '11': 'K', '12': 'a', '13': 'K'}),
    row_spec(**{'2': 'K', '3': 'K', '12': 'K', '13': 'K'}),
    row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}),
])

crabkin_side = build_rows([
    row_spec(**{}),
    row_spec(**{'8': 'K', '9': 'K', '10': 'K', '11': 'K'}),
    row_spec(**{'7': 'K', '8': 'x', '9': 'a', '10': 'a', '11': 'x', '12': 'K'}),
    row_spec(**{'1': 'K', '2': 'a', '3': 'K', '6': 'K', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'K'}),
    row_spec(**{'1': 'K', '2': 'b', '3': 'a', '4': 'a', '5': 'K', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'a', '13': 'a', '14': 'K'}),
    row_spec(**{'2': 'K', '3': 'a', '4': 'a', '5': 'b', '6': 'a', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'a', '12': 'b', '13': 'K'}),
    row_spec(**{'3': 'K', '4': 'K', '5': 'K', '6': 'K', '7': 'a', '8': 'a', '9': 'a', '10': 'a', '11': 'K', '12': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'K', '7': 'K', '10': 'K', '12': 'K', '13': 'a', '14': 'K'}),
    row_spec(**{'3': 'K', '4': 'a', '5': 'K', '12': 'K', '13': 'a', '14': 'K'}),
    row_spec(**{'3': 'K', '4': 'K', '13': 'K', '14': 'K'}),
    row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}), row_spec(**{}),
])


def bob(rows):
    return ["." * 16] + rows[:-1]


def check_and_render(name, down, up, side, palette, stage='base'):
    ok = True
    for label, rows in (('down', down), ('up', up), ('side', side)):
        ok = check_connected(rows, f'  {name} {label}') and ok
    range_ok = check_sprite_ranges(render(down, palette), stage)
    return ok and range_ok


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out_dir, exist_ok=True)

    chains = [
        ('owletch', owletch_down, owletch_up, owletch_side, PAL_OWL),
        ('viperling', viperling_down, viperling_up, viperling_side, PAL_VIPER),
        ('jellitide', jellitide_down, jellitide_up, jellitide_side, PAL_JELLY),
        ('crabkin', crabkin_down, crabkin_up, crabkin_side, PAL_CRAB),
    ]

    all_ok = True
    from PIL import Image, ImageDraw
    scale = 10
    sheet = Image.new('RGBA', (len(chains) * (16 * scale + 20), 16 * scale + 30), (30, 30, 30, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (name, down, up, side, palette) in enumerate(chains):
        ok = check_and_render(name, down, up, side, palette)
        all_ok = all_ok and ok
        img = render(down, palette)
        big = img.resize((16 * scale, 16 * scale), Image.NEAREST)
        cx = i * (16 * scale + 20)
        draw.text((cx + 4, 2), name, fill=(255, 255, 255, 255))
        sheet.paste(big, (cx + 10, 20), big)

    sheet.save(os.path.join(out_dir, 'wave1_sheet.png'))
    print(f'\nwrote wave1_sheet.png')
    print('ALL GATES PASS' if all_ok else 'SOME GATES FAILED (see above)')


if __name__ == '__main__':
    main()
