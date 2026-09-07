# Luminance scan across a horizontal band — the test for "does anything
# in this frame actually cast a shadow". A row that walks smoothly from
# edge to edge has no shadow on it, whatever the code says it drew.
import sys
sys.path.insert(0, 'tools')
from critzcrop import readpng

path = sys.argv[1]
y0 = float(sys.argv[2]); y1 = float(sys.argv[3])
w, h, bpp, p = readpng(path)
print('size', w, h)
step = max(1, int((y1 - y0) * h / 8))
for y in range(int(y0 * h), int(y1 * h), step):
    row = []
    for x in range(int(w * 0.06), int(w * 0.95), max(1, w // 26)):
        i = (y * w + x) * bpp
        row.append((p[i] * 299 + p[i+1] * 587 + p[i+2] * 114) // 1000)
    print(y, row)
