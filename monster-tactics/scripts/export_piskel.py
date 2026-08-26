# Packages generated pixel art into a real .piskel file - the inverse of
# import_piskel.py. Used so hand-authored monster art (built as pixel grids
# in code, the same technique as the game's earlier custom-art batches) can
# be opened, inspected, and hand-tweaked in the actual Piskel app
# (piskelapp.com) rather than only existing as a flat PNG.
#
# Format written matches exactly what Piskel itself writes (see
# import_piskel.py's docstring for how this was reverse-engineered from the
# piskel source): top-level {modelVersion, piskel: {name, description, fps,
# width, height, layers: [<layer JSON string>], hiddenFrames}}, one layer
# whose single chunk is a horizontal strip of all frames side by side
# (base64 PNG data URL) plus a [[0],[1],...] layout mapping strip position
# to frame index.
#
# Library use (from another script building monster frames):
#   from export_piskel import write_piskel
#   write_piskel('out/zapling.piskel', 'zapling', frames)   # frames: 9 PIL RGBA images, 16x16
#
# CLI use (packages 9 same-sized PNGs, in argument order, into one .piskel):
#   python3 scripts/export_piskel.py --name zapling --out out/ frame0.png frame1.png ... frame8.png
import argparse
import base64
import io
import json
import os

from PIL import Image

MODEL_VERSION = 2


def _frames_to_strip_base64(frames):
    w, h = frames[0].size
    strip = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        strip.paste(frame, (i * w, 0))
    buf = io.BytesIO()
    strip.save(buf, 'PNG')
    return base64.b64encode(buf.getvalue()).decode('ascii')


def write_piskel(path, name, frames, fps=8, description='', layer_name='Layer 1'):
    """frames: list of same-sized PIL RGBA images, in timeline order."""
    if not frames:
        raise ValueError('need at least one frame')
    w, h = frames[0].size
    if any(f.size != (w, h) for f in frames):
        raise ValueError('all frames must share one size')

    layer = {
        'name': layer_name,
        'opacity': 1,
        'frameCount': len(frames),
        'chunks': [
            {
                'layout': [[i] for i in range(len(frames))],
                'base64PNG': 'data:image/png;base64,' + _frames_to_strip_base64(frames),
            }
        ],
    }

    piskel = {
        'modelVersion': MODEL_VERSION,
        'piskel': {
            'name': name,
            'description': description,
            'fps': fps,
            'height': h,
            'width': w,
            'layers': [json.dumps(layer)],
            'hiddenFrames': [],
        },
    }

    with open(path, 'w') as f:
        json.dump(piskel, f)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('frame_pngs', nargs='+', help='frame PNGs in timeline order')
    parser.add_argument('--name', required=True)
    parser.add_argument('--out', default='.', help='output directory')
    parser.add_argument('--fps', type=int, default=8)
    args = parser.parse_args()

    frames = [Image.open(p).convert('RGBA') for p in args.frame_pngs]
    os.makedirs(args.out, exist_ok=True)
    out_path = os.path.join(args.out, f'{args.name}.piskel')
    write_piskel(out_path, args.name, frames, fps=args.fps)
    print(f'wrote {out_path} ({len(frames)} frames, {frames[0].size[0]}x{frames[0].size[1]})')


if __name__ == '__main__':
    main()
