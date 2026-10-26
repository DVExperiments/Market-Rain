#!/usr/bin/env python3
"""Optional icon regeneration helper. Requires Pillow. Outputs custom PWA PNGs."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import random, math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'icons'
OUT.mkdir(exist_ok=True)

def generate(size,maskable=False):
    r=size/512
    im=Image.new('RGB',(size,size),(3,14,12))
    d=ImageDraw.Draw(im)
    for y in range(size):
        v=int(y/size*8)
        d.line((0,y,size,y),fill=(3,18-v//2,12-v//2))
    rng=random.Random(19)
    for j in range(26):
        x=int((j+.2)*size/26)
        ty=rng.randrange(3,11)
        for k in range(ty):
            y=int((k*40+(j*73)%207)*r)
            if y>=size:continue
            width=int((8+(j%3)*2)*r)
            d.rectangle((x,y,x+width,y+int(15*r)),fill=(7,65+(j%6)*12,33+(k%3)*5))
    green=(34,255,140)
    if maskable:
        pad=int(110*r)
    else:
        pad=int(69*r)
    left=pad;right=size-pad; top=int(102*r);bottom=size-int(100*r)
    d.rounded_rectangle((left,top,right,bottom),radius=int(22*r),fill=(5,26,18),outline=(35,129,75),width=max(2,int(4*r)))
    # Stylized falling rain bars shaped like an M.
    x0=left+int(53*r);y0=top+int(73*r);ys=bottom-int(58*r)
    width=max(4,int(17*r))
    coords=[(x0,y0,x0,ys),(x0,y0,x0+int(63*r),y0+int(70*r)),(x0+int(63*r),y0+int(70*r),x0+int(125*r),y0),(x0+int(125*r),y0,x0+int(125*r),ys)]
    for a,b,c,e in coords:
        d.line((a,b,c,e),fill=green,width=width,joint='curve')
    for j in range(6):
        xx=left+int((35+j*37)*r)
        y1=bottom-int((25+j%3*15)*r)
        d.line((xx,y1,xx,y1+int(18*r)),fill=(44,207,102),width=max(3,int(7*r)))
    if size>=512:
        glow=im.copy().filter(ImageFilter.GaussianBlur(int(7*r)))
        # keep crisp final logo; do not overexpose it
    return im

for size,name,mask in [(192,'icon-192.png',False),(512,'icon-512.png',False),(512,'icon-maskable-512.png',True),(180,'apple-touch-icon.png',False)]:
    generate(size,mask).save(OUT/name)
print('Generated four dedicated app icons.')
