"""Deterministic PROBNAYA social composition; content is a diagram or real image.

Mark coordinates derive from Surface's approved observations-og.html.
Archivo / Geist Mono fonts are supplied explicitly by workspace configuration.
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

# Rendering must not leave Python cache artifacts in the source checkout.
sys.dont_write_bytecode = True

spec = json.load(open(sys.argv[1], encoding='utf-8'))
if spec.get('layout') == 'probnaya-plate-v1':
    from visual_plate import render_plate
    render_plate(spec)
    sys.exit(0)
ink, paper, mid, blue = '#16181C', '#EFF0F2', '#767B84', '#2233CC'
im = Image.new('RGB', (1200, 630), paper)
d = ImageDraw.Draw(im)

def font(size, mono=False):
    return ImageFont.truetype(spec['monoFont' if mono else 'titleFont'], size)

def text(value, xy, size, mono=False, color=ink):
    d.text(xy, value, font=font(size, mono), fill=color)

# Approved mark geometry; neither fonts nor the signature are generated.
s, x, y = 1, 64, 48
d.rectangle((x+4*s, y+3*s, x+24*s, y+29*s), outline=ink, width=2)
d.rectangle((x+14*s, y+14*s, x+31*s, y+17*s), fill=ink)
text('PROBNAYA', (110, 47), 25)
text('PROB–'+spec['date'].replace('-', '.'), (820, 52), 20, True)

title = spec['title']
words, lines, line = title.split(), [], ''
for word in words:
    candidate = (line+' '+word).strip()
    if d.textlength(candidate, font=font(48)) > 1060 and line:
        lines.append(line); line = word
    else:
        line = candidate
lines.append(line)
if len(lines) > 2:
    raise ValueError('Title needs a shorter visual variant; no clipping permitted.')
for n, line in enumerate(lines):
    text(line, (64, 135+n*56), 48)
d.line((64, 275, 1136, 275), fill=ink, width=2)

v = spec['visual']
if v['kind'] == 'diagram':
    nodes = v['nodes']
    if not 2 <= len(nodes) <= 4:
        raise ValueError('A factual diagram needs 2..4 labelled nodes.')
    width, gap = (1072-(len(nodes)-1)*40)//len(nodes), 40
    for n, node in enumerate(nodes):
        left = 64+n*(width+gap)
        d.rectangle((left, 344, left+width, 450), outline=ink, width=2)
        size = 22
        while d.textlength(node, font=font(size, True)) > width-24 and size > 12:
            size -= 1
        if d.textlength(node, font=font(size, True)) > width-24:
            raise ValueError('Diagram label is too long.')
        tw = d.textlength(node, font=font(size, True))
        text(node, (left+(width-tw)/2, 384), size, True)
        if n < len(nodes)-1:
            d.line((left+width+6, 397, left+width+gap-6, 397), fill=blue, width=2)
            d.line((left+width+gap-13, 390, left+width+gap-6, 397, left+width+gap-13, 404), fill=blue, width=2)
    text(v.get('caption', 'IMPLEMENTATION DIAGRAM'), (64, 485), 16, True, mid)
else:
    image = Image.open(v['file']).convert('RGB')
    image.thumbnail((1072, 245))
    im.paste(image, ((1200-image.width)//2, 300))
    if v.get('synthetic'):
        text('GENERATED CONCEPT / NOT A PRODUCT SCREENSHOT', (64, 548), 14, True, mid)

text(spec['status'].replace('_', ' ').upper(), (64, 578), 17, True)
text('INSTRUMENTS / INVESTIGATIONS', (750, 578), 17, True, blue)
im.save(spec['output'])
