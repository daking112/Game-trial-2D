# Shared helpers for hand-authored tower-monster pixel art, at either the
# pack-matching 16x16 (TOWER_SHEET) or the bigger 32x32 (TOWER_BIG_SHEET,
# used for original species - see data/monsters.js) cell size. Pass `size`
# through to every function below; it defaults to 16 so existing 16x16
# callers (recolor/pack-derived work) don't need to change.
#
# The two prior from-scratch attempts (hand-typed grids, then parametric
# coordinate generation) both produced silhouettes with parts that read as
# floating/disconnected (a horn with a transparent gap before the head, a
# stray isolated pixel) - a defect that's obvious once rendered but easy to
# miss while placing pixels blind, row by row, in a text editor. connected_components
# below turns "does this read as one creature" from a visual judgment call
# into a hard, provable check: every opaque pixel must belong to a single
# 4-connected region. Run it BEFORE rendering/showing anything - it names
# the exact stray/disconnected pixel coordinates so they can be fixed
# precisely instead of guessed at from a screenshot.
import os

K = (0, 0, 0, 255)


def rows16(specs, size=16):
    """specs: list of `size` {col_index: char} dicts -> `size` row strings."""
    out = []
    for spec in specs:
        r = ['.'] * size
        for idx, ch in spec.items():
            r[idx] = ch
        out.append(''.join(r))
    return out


def render(rows, palette, size=16):
    from PIL import Image
    assert len(rows) == size, f'{len(rows)} rows, want {size}'
    for i, row in enumerate(rows):
        assert len(row) == size, f'row {i} is {len(row)} wide, want {size}: {row!r}'
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                img.putpixel((x, y), palette[ch])
    return img


def opaque_pixels(rows):
    return {(x, y) for y, row in enumerate(rows) for x, ch in enumerate(row) if ch != '.'}


def connected_components(rows):
    """4-connectivity (orthogonal only - diagonal-only touching pixels read
    as visually pinched/disconnected in pixel art, so they don't count).
    Returns a list of components (each a set of (x,y)), largest first."""
    pixels = opaque_pixels(rows)
    seen = set()
    components = []
    for start in pixels:
        if start in seen:
            continue
        stack = [start]
        comp = set()
        while stack:
            p = stack.pop()
            if p in comp:
                continue
            comp.add(p)
            x, y = p
            for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                if (nx, ny) in pixels and (nx, ny) not in comp:
                    stack.append((nx, ny))
        seen |= comp
        components.append(comp)
    components.sort(key=len, reverse=True)
    return components


def check_connected(rows, label=''):
    """Raises with exact stray-pixel coordinates if not a single component."""
    comps = connected_components(rows)
    if len(comps) <= 1:
        print(f'{label}: OK, single connected silhouette ({len(comps[0]) if comps else 0}px)')
        return True
    comps_sorted = sorted(comps, key=len, reverse=True)
    print(f'{label}: FAIL, {len(comps)} disconnected pieces:')
    print(f'  main body: {len(comps_sorted[0])}px')
    for c in comps_sorted[1:]:
        print(f'  stray piece ({len(c)}px): {sorted(c)}')
    return False


def check_sprite_ranges(img, stage, size=16):
    """Numeric bar measured off real pack/game art. opaque%/outline% are
    fractions of the sprite so they apply at any size, but color count
    scales with resolution - measured off the real 16px pack (base ~5-9,
    final ~6-12) AND off this game's own real 32px art (enemies-boss.png:
    9-12 colors even for varied complexity), so 32px gets a genuinely
    higher ceiling rather than being held to the 16px count."""
    RANGES_16 = {
        'base':  dict(colors=(5, 9),  opaque=(0.30, 0.50), outline=(0.25, 0.55)),
        'mid':   dict(colors=(6, 10), opaque=(0.45, 0.65), outline=(0.30, 0.55)),
        'final': dict(colors=(6, 12), opaque=(0.55, 0.82), outline=(0.35, 0.55)),
    }
    RANGES_32 = {
        'base':  dict(colors=(6, 12), opaque=(0.30, 0.50), outline=(0.25, 0.55)),
        'mid':   dict(colors=(7, 13), opaque=(0.45, 0.65), outline=(0.30, 0.55)),
        'final': dict(colors=(8, 15), opaque=(0.55, 0.82), outline=(0.35, 0.55)),
    }
    rng = (RANGES_32 if size >= 32 else RANGES_16)[stage]
    total = size * size
    colors = [(c, col) for c, col in img.getcolors(total) if col[3] > 0]
    n = sum(c for c, _ in colors)
    black = sum(c for c, col in colors if col[:3] == (0, 0, 0))
    opaque_frac = n / total
    outline_frac = black / n if n else 0
    problems = []
    if not (rng['colors'][0] <= len(colors) <= rng['colors'][1]):
        problems.append(f'{len(colors)} colors, want {rng["colors"]}')
    if not (rng['opaque'][0] <= opaque_frac <= rng['opaque'][1]):
        problems.append(f'{opaque_frac:.0%} opaque, want {rng["opaque"][0]:.0%}-{rng["opaque"][1]:.0%}')
    if not (rng['outline'][0] <= outline_frac <= rng['outline'][1]):
        problems.append(f'{outline_frac:.0%} outline, want {rng["outline"][0]:.0%}-{rng["outline"][1]:.0%}')
    ok = not problems
    print(f'{"OK" if ok else "FAIL"} colors={len(colors)} opaque={opaque_frac:.0%} outline={outline_frac:.0%}' +
          ('  -- ' + '; '.join(problems) if problems else ''))
    return ok
