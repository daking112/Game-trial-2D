# Converts a hand-drawn .piskel file (from https://www.piskelapp.com) into a
# 48x48 tower-monster block: 3 rows (facings: down/up/side) x 3 cols (idle
# animation frames), 16px cells - the exact layout gen_towers.py expects for
# one monster, and that towers.png stores per monster (see
# gen_towers.py's LINE_ASSIGNMENTS / block_origin).
#
# Drawing convention (draw to this in Piskel's own frame timeline - Piskel
# has no native "facing" concept, so frame order in the timeline IS the
# convention):
#   canvas size:  16x16
#   frame 0-2:    facing down  (frames 0/1/2 of the idle bob)
#   frame 3-5:    facing up
#   frame 6-8:    facing side
#   exactly 9 frames total, any number of layers (composited by opacity).
#
# Usage:
#   python3 scripts/import_piskel.py monster.piskel [monster2.piskel ...]
#   python3 scripts/import_piskel.py --out custom_blocks/ *.piskel
#
# Writes <name>.png (48x48, RGBA) per input file, using the .piskel's own
# "name" field (piskel.name) as the output filename, unless --out is a
# single filename.
#
# Format reverse-engineered directly from the piskel source
# (github.com/piskelapp/piskel), not guessed from docs:
#   src/js/utils/serialization/Serializer.js   - what gets written
#   src/js/utils/serialization/Deserializer.js - how it's read back
#   src/js/utils/FrameUtils.js#createFramesFromChunk - chunk -> frame slicing
#
# A .piskel file is JSON: {modelVersion, piskel: {width, height, layers: [
# <layer JSON string>, ...], ...}}. Each layer string parses to {name,
# opacity, frameCount, chunks: [{layout, base64PNG}]}. base64PNG is a PNG
# data URL holding all of that layer's frames side by side in one
# horizontal strip, each exactly width x height. layout is a 2D index array
# (layout[col][row] -> frame index) mapping strip position to frame index -
# for a normal single-row strip (the common case, and the only one this
# script needs to support since we're consuming files, not chunking huge
# ones) that's just [[0], [1], [2], ...]. Frames across layers are
# alpha-composited in layer order using each layer's opacity.
import argparse
import base64
import io
import json
import os
import sys

from PIL import Image

CELL = 16
FRAMES_PER_MONSTER = 9
DIRECTIONS = ['down', 'up', 'side']  # frame index // 3 -> facing


def decode_data_url(data_url):
    header, _, b64 = data_url.partition(',')
    if not header.startswith('data:') or ';base64' not in header:
        raise ValueError(f'unsupported data URL header: {header!r}')
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGBA')


def layer_frames(layer_json_string, canvas_w, canvas_h):
    """Returns {frame_index: PIL.Image} for one layer, applying its opacity."""
    layer = json.loads(layer_json_string)
    opacity = layer.get('opacity', 1)
    frames = {}
    for chunk in layer['chunks']:
        strip = decode_data_url(chunk['base64PNG'])
        layout = chunk['layout']
        n_cols = len(layout)
        n_rows = len(layout[0]) if n_cols else 0
        if n_cols == 0 or strip.width % n_cols or strip.height % n_rows:
            raise ValueError(
                f"chunk layout {n_cols}x{n_rows} doesn't evenly divide "
                f'strip {strip.width}x{strip.height}'
            )
        fw, fh = strip.width // n_cols, strip.height // n_rows
        if (fw, fh) != (canvas_w, canvas_h):
            raise ValueError(f'frame size {fw}x{fh} != canvas {canvas_w}x{canvas_h}')
        for col in range(n_cols):
            for row in range(n_rows):
                idx = layout[col][row]
                frame = strip.crop((col * fw, row * fh, col * fw + fw, row * fh + fh))
                if opacity < 1:
                    r, g, b, a = frame.split()
                    a = a.point(lambda v: int(v * opacity))
                    frame = Image.merge('RGBA', (r, g, b, a))
                frames[idx] = frame
    return frames


def load_piskel(path):
    """Returns (name, [frame0..frameN]) with layers composited bottom-to-top."""
    with open(path) as f:
        data = json.load(f)
    piskel = data['piskel']
    w, h = piskel['width'], piskel['height']
    if (w, h) != (CELL, CELL):
        raise ValueError(f'{path}: canvas is {w}x{h}, expected {CELL}x{CELL}')

    composited = None
    for layer_string in piskel['layers']:
        frames = layer_frames(layer_string, w, h)
        if composited is None:
            n = max(frames) + 1
            composited = [Image.new('RGBA', (w, h), (0, 0, 0, 0)) for _ in range(n)]
        for idx, frame in frames.items():
            composited[idx] = Image.alpha_composite(composited[idx], frame)

    if composited is None or len(composited) != FRAMES_PER_MONSTER:
        got = 0 if composited is None else len(composited)
        raise ValueError(
            f'{path}: found {got} frames, expected exactly {FRAMES_PER_MONSTER} '
            f'(3 facings x 3 frames - see module docstring for the frame-order '
            f'convention)'
        )
    return piskel.get('name', os.path.splitext(os.path.basename(path))[0]), composited


def build_block(frames):
    """Lays 9 sequential frames out as the 3(down/up/side) x 3(anim) block
    gen_towers.py expects: row d = frames[d*3 : d*3+3], one row per facing."""
    block = Image.new('RGBA', (3 * CELL, 3 * CELL), (0, 0, 0, 0))
    for d in range(3):
        for f in range(3):
            block.paste(frames[d * 3 + f], (f * CELL, d * CELL))
    return block


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('piskel_files', nargs='+')
    parser.add_argument(
        '--out',
        default='.',
        help='output directory (default: current dir); named <piskel-name>.png',
    )
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    ok = 0
    for path in args.piskel_files:
        try:
            name, frames = load_piskel(path)
        except Exception as e:
            print(f'FAILED {path}: {e}', file=sys.stderr)
            continue
        block = build_block(frames)
        out_path = os.path.join(args.out, f'{name}.png')
        block.save(out_path)
        print(f'{path} -> {out_path} ({name}, {len(frames)} frames)')
        ok += 1

    print(f'\n{ok}/{len(args.piskel_files)} converted')
    if ok != len(args.piskel_files):
        sys.exit(1)


if __name__ == '__main__':
    main()
