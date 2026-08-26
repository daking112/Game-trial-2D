# Procedural path generator for BattleScene stages (data/stages.js).
#
# Deliberately offline/curated, NOT a live per-run generator: this script
# is run by hand, prints a batch of candidate pathCells arrays, and a
# person picks the good ones to paste into stages.js as new named stage
# entries. A bad/degenerate map should never reach a real player - see
# README.md "Biomes & new maps" for why this tradeoff was made over
# generating a fresh map every run.
#
#   python3 scripts/gen_paths.py [count]
#
# Every candidate is constructed so it's valid by build (not just filtered
# after the fact): a "staircase" of alternating horizontal/vertical
# segments, columns strictly decreasing from the spawn edge (col ~27) to
# the base edge (col 0), so no two segments can ever share a cell - see
# build_waypoints below for the exact construction and why it can't overlap
# itself.
import random
import sys

GRID_COLS = 28
GRID_ROWS = 16


def gen_columns(rng, m, start):
    """m strictly-decreasing column breakpoints from `start` down to 0,
    each consecutive pair at least 2 apart (so every horizontal segment is
    long enough to place a tower next to and actually see as a segment,
    not a 1-cell notch). Composition of `start` into (m-1) parts, each
    part >= 2, via random stars-and-bars - returns None if there isn't
    enough room (m too big for the available columns)."""
    n_segs = m - 1
    if start < 2 * n_segs:
        return None
    parts = [2] * n_segs
    remaining = start - 2 * n_segs
    for _ in range(remaining):
        parts[rng.randrange(n_segs)] += 1
    cols = [start]
    c = start
    for p in parts:
        c -= p
        cols.append(c)
    return cols


def gen_rows(rng, m):
    """m-1 row values (one per horizontal segment), each consecutive pair
    at least 2 apart (same "no 1-cell notch" reasoning as columns, applied
    to the vertical connecting segments) and within grid bounds."""
    rows = [rng.randrange(GRID_ROWS)]
    for _ in range(m - 2):
        prev = rows[-1]
        candidates = [r for r in range(GRID_ROWS) if abs(r - prev) >= 2]
        rows.append(rng.choice(candidates))
    return rows


def build_waypoints(cols, rows):
    """Alternating horizontal/vertical "staircase": (cols[0],rows[0]) ->
    (cols[1],rows[0]) [horizontal] -> (cols[1],rows[1]) [vertical] -> ...
    -> (cols[-1], rows[-1]) [horizontal, ends at the base edge]. Columns
    strictly decrease and are never repeated, so horizontal segments never
    overlap each other; each vertical segment sits at its own column for
    the same reason - the path can never cross or retrace itself."""
    wp = [(cols[0], rows[0])]
    for i in range(1, len(cols)):
        wp.append((cols[i], rows[i - 1]))
        if i < len(rows):
            wp.append((cols[i], rows[i]))
    return wp


def path_profile(cols, rows):
    """Row-at-each-column sample, used only to measure how different two
    candidates look from each other (see dedupe below) - not part of the
    game data."""
    profile = []
    row_at = list(rows) + [rows[-1]]
    seg = 0
    for c in range(GRID_COLS - 1, -1, -1):
        while seg < len(cols) - 1 and c < cols[seg + 1]:
            seg += 1
        profile.append(row_at[seg] if seg < len(row_at) else rows[-1])
    return profile


def generate_candidate(rng):
    start = rng.choice([25, 26, 27])
    m = rng.randint(3, 9)  # column breakpoints -> (m-1) horizontal segments
    cols = gen_columns(rng, m, start)
    if cols is None:
        return None
    rows = gen_rows(rng, m)
    wp = build_waypoints(cols, rows)
    spread = max(rows) - min(rows)
    bends = len(rows) - 1
    score = spread + 3 * bends
    return {
        'waypoints': wp,
        'cols': cols,
        'rows': rows,
        'spread': spread,
        'bends': bends,
        'score': score,
        'profile': path_profile(cols, rows),
    }


def validate(cand):
    wp = cand['waypoints']
    for c, r in wp:
        if not (0 <= c < GRID_COLS and 0 <= r < GRID_ROWS):
            return False
    for i in range(len(wp) - 1):
        c0, r0 = wp[i]
        c1, r1 = wp[i + 1]
        if c0 != c1 and r0 != r1:
            return False
        if c0 == c1 and r0 == r1:
            return False
    if wp[0][0] < 24 or wp[-1][0] != 0:
        return False
    return True


def profile_distance(a, b):
    return sum(abs(x - y) for x, y in zip(a, b))


def curate(candidates, count, min_distance=60):
    """Round-robins across bend-count buckets (best-spread candidate from
    each) rather than a flat top-N by score - a flat sort always prefers
    the most complex paths (score rewards bend count), which would only
    ever surface switchback-style mazes and never a simple valley-style
    layout. The existing hand-authored set deliberately mixes both."""
    by_bends = {}
    for cand in candidates:
        by_bends.setdefault(cand['bends'], []).append(cand)
    for bucket in by_bends.values():
        bucket.sort(key=lambda c: -c['spread'])

    picked = []
    bend_levels = sorted(by_bends.keys())
    idx = {b: 0 for b in bend_levels}
    while len(picked) < count and any(idx[b] < len(by_bends[b]) for b in bend_levels):
        for b in bend_levels:
            bucket = by_bends[b]
            while idx[b] < len(bucket):
                cand = bucket[idx[b]]
                idx[b] += 1
                if all(profile_distance(cand['profile'], p['profile']) >= min_distance for p in picked):
                    picked.append(cand)
                    break
            if len(picked) >= count:
                break
    return picked


def format_waypoints(wp):
    return ', '.join(f'{{ col: {c}, row: {r} }}' for c, r in wp)


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    rng = random.Random(2026)
    pool = []
    for _ in range(4000):
        cand = generate_candidate(rng)
        if cand and validate(cand):
            pool.append(cand)
    print(f'{len(pool)} valid candidates generated', file=sys.stderr)

    picks = curate(pool, count)
    for i, cand in enumerate(picks):
        print(f'--- candidate {i} (bends={cand["bends"]}, spread={cand["spread"]}, score={cand["score"]}) ---')
        print(f'    pathCells: [ {format_waypoints(cand["waypoints"])} ]')


if __name__ == '__main__':
    main()
