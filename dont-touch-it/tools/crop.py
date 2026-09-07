import sys
sys.path.insert(0, 'tools')
from critzcrop import readpng, writepng
src, dst = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = (float(v) for v in sys.argv[3:7])
w, h, bpp, p = readpng(src)
X0, Y0, X1, Y1 = int(x0*w), int(y0*h), int(x1*w), int(y1*h)
ow, oh = X1-X0, Y1-Y0
o = bytearray(ow*oh*3)
for y in range(oh):
    for x in range(ow):
        i = ((Y0+y)*w + (X0+x))*bpp; j = (y*ow+x)*3
        o[j] = p[i]; o[j+1] = p[i+1]; o[j+2] = p[i+2]
writepng(dst, ow, oh, bytes(o))
print(dst, ow, oh)
