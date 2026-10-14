"""4:5 publication plate reconstructed from user-supplied visual precedents.

Only the frame is shared: diagrams are implementation descriptions, not measured
specimens. No figure number or publication approval is inferred from references.
"""
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont


def render_plate(spec):
    width, height = spec.get('width', 2160), spec.get('height', 2700)
    if (width, height) not in [(1080, 1350), (2160, 2700)]:
        raise ValueError('The publication plate requires a 4:5 master or export.')
    scale = width / 1080
    ink, paper, mid, faint, blue = '#16181C', '#EFF0F2', '#858B96', '#C9CDD4', '#2734D9'
    im = Image.new('RGB', (width, height), paper)
    d = ImageDraw.Draw(im)

    def xy(point):
        return tuple(round(v * scale) for v in point)

    @lru_cache(maxsize=80)
    def font(size, mono=False, bold=False):
        f = ImageFont.truetype(spec['monoFont' if mono else 'titleFont'], round(size * scale))
        if bold and not mono:
            try:
                f.set_variation_by_name('SemiBold')
            except (OSError, ValueError):
                pass
        return f

    def measure(value, size, mono=False, bold=False, spacing=0):
        return d.textlength(value, font=font(size, mono, bold)) / scale + max(0, len(value)-1) * spacing

    def text(value, point, size, mono=False, color=ink, bold=False, spacing=0, right=False):
        x, y = point
        if right:
            x -= measure(value, size, mono, bold, spacing)
        if spacing:
            for char in value:
                d.text(xy((x, y)), char, font=font(size, mono, bold), fill=color)
                x += measure(char, size, mono, bold) + spacing
        else:
            d.text(xy((x, y)), value, font=font(size, mono, bold), fill=color)

    def line(points, color=faint, weight=1):
        d.line([xy(p) for p in points], fill=color, width=max(1, round(weight * scale)))

    def rect(bounds, color=ink, fill=None, weight=1):
        d.rectangle(xy(bounds), outline=color, fill=fill, width=max(1, round(weight * scale)))

    def wrap(value, size, max_width=972, mono=False, bold=False):
        lines, current = [], ''
        for word in value.split():
            trial = (current + ' ' + word).strip()
            if measure(trial, size, mono, bold) > max_width and current:
                lines.append(current)
                current = word
            else:
                current = trial
        lines.append(current)
        if any(measure(s, size, mono, bold) > max_width for s in lines):
            raise ValueError('A plate label is too long; shorten it explicitly.')
        return lines

    # Shared edge scales, observed on the supplied publication images.
    for x in range(0, 1081, 12):
        line([(x, 0), (x, 14)])
    line([(0, 14), (1080, 14)])
    for y in range(0, 1351, 12):
        line([(0, y), (22, y)])
    line([(22, 0), (22, 1350)])

    # Established mark geometry from Surface's executable source.
    bx, by, s = 56, 55, 0.95
    rect((bx+4*s, by+3*s, bx+24*s, by+29*s), weight=2)
    rect((bx+14*s, by+14*s, bx+31*s, by+17*s), fill=ink, weight=0)
    text('PROBNAYA', (105, 45), 44, bold=True)
    text('INDEPENDENT COMPUTATIONAL LABORATORY', (105, 109), 12, True, mid, spacing=1.9)

    v = spec['visual']
    state = v.get('stateLabel', spec['status'].replace('_', ' ').upper())
    text(state, (1026, 64), 12, True, blue, spacing=1.8, right=True)
    text(v.get('stateDetail', 'INSTRUMENTS / INVESTIGATIONS'), (1026, 89), 10, True, mid, spacing=1.2, right=True)
    line([(22, 218), (1080, 218)], blue)
    rect((30, 229, 86, 249), blue)
    text('DATUM', (37, 233), 9, True, blue, spacing=1.2)
    specimen = v.get('specimen', 'IMPLEMENTATION DIAGRAM / NOT A MEASURED SPECIMEN')
    text(specimen, (1026, 233), 10, True, mid, spacing=0.5, right=True)

    heading = v.get('heading', spec['title'])
    heading_size = 64 if v.get('heading') else 48
    headings = wrap(heading, heading_size, bold=True)
    if len(headings) > 2:
        raise ValueError('Plate heading needs a shorter visual variant.')
    for n, value in enumerate(headings):
        text(value, (56, 279+n*58), heading_size, bold=True)
    subtitle = v.get('subheading', 'INSTRUMENT / IMPLEMENTATION')
    if measure(subtitle, 16, True, spacing=1) > 972:
        raise ValueError('Plate subtitle is too long.')
    text(subtitle, (56, 360 if len(headings) == 1 else 408), 16, True, blue, spacing=1)

    if v['kind'] == 'diagram':
        if v.get('layout') == 'cancellation':
            # Persistent task rail above the disposable execution path.
            text('TASK / PERSISTENT', (56, 436), 12, True, blue, spacing=1)
            text('BRIEF · CONTEXT · RUN HISTORY', (1026, 436), 10, True, mid, spacing=0.7, right=True)
            line([(60, 470), (1026, 470)], blue)
            for x in [60, 535, 1022]:
                rect((x-3, 467, x+3, 473), blue, blue)
            steps = [
                ('ACTIVE RUN', 'PROVIDER SESSION EXECUTING'),
                ('STOP REQUEST', 'CLI · TUI · WEB'),
                ('PROVIDER CANCEL', 'DELIVERED THROUGH THE ADAPTER'),
                ('CANCELLED OUTCOME', 'FAILED RUN · KIND CANCELLED'),
                ('TASK RETAINED', 'BRIEF · NOTES · RUN HISTORY'),
            ]
            text('RUN / DISPOSABLE EXECUTION', (56, 514), 11, True, mid, spacing=1)
            line([(63, 560), (63, 856)], ink)
            for n, (label, detail) in enumerate(steps):
                y = 552 + n * 72
                rect((60, y+10, 66, y+16), blue if n == 3 else ink)
                text(f'{n+1:02}', (88, y+5), 11, True, blue)
                text(label, (140, y), 20, bold=True)
                text(detail, (140, y+30), 10, True, mid, spacing=0.8)
                line([(56, y+57), (1026, y+57)])
            text('PATH DESCRIBED FROM CODE · NOT A CAPTURE OF ONE RUN', (56, 936), 10, True, mid, spacing=0.5)
        else:
            nodes = v['nodes']
            if not 2 <= len(nodes) <= 4:
                raise ValueError('A diagram needs 2..4 nodes.')
            line([(63, 525), (63, 525+(len(nodes)-1)*100)], ink)
            for n, label in enumerate(nodes):
                y = 510+n*100
                rect((60, y+15, 66, y+21), blue)
                text(f'{n+1:02}', (88, y+9), 12, True, blue)
                text(label, (140, y), 28, bold=True)
                line([(56, y+77), (1026, y+77)])
            caption = wrap(v.get('caption', 'IMPLEMENTATION DIAGRAM'), 10, mono=True)
            for n, value in enumerate(caption):
                text(value, (56, 934+n*17), 10, True, mid)
    else:
        # Respect the original asset's composition; fit without cropping.
        asset = Image.open(v['file']).convert('RGB')
        asset.thumbnail(xy((972, 480)))
        im.paste(asset, (round((width-asset.width)/2), round(455*scale)))
        text('GENERATED CONCEPT / NOT A PRODUCT SCREENSHOT' if v.get('synthetic') else 'SOURCE IMAGE / AS SUPPLIED', (56, 954), 10, True, mid)

    statement = v.get('statement', spec['title'])
    statements = wrap(statement, 25)
    if len(statements) > 2:
        raise ValueError('Plate statement is too long.')
    for n, value in enumerate(statements):
        text(value, (56, 1000+n*29), 25)
    rows = v.get('rows', [['STATUS', spec['status'].replace('_', ' ').upper()], ['FIGURE', 'IMPLEMENTATION DIAGRAM'], ['SURFACE', spec.get('surface', 'PROBNAYA.WORK')]])
    if len(rows) > 5:
        raise ValueError('At most five metadata rows fit this plate.')
    for n, (label, value) in enumerate(rows):
        y = 1075+n*27
        text(label, (56, y), 10, True, mid, spacing=1)
        if measure(value, 12, True) > 775:
            raise ValueError('Plate metadata is too long.')
        text(value, (250, y-1), 12, True)
    line([(56, 1247), (1026, 1247)], ink)
    # Figure numbering remains unassigned until explicitly provided.
    footer = v.get('figureLabel', 'DRAFT / '+spec['title'].upper())
    footer_size = 16
    while measure(footer, footer_size, True) > 730 and footer_size > 10:
        footer_size -= 1
    text(footer, (56, 1264), footer_size, True)
    text('PROB–'+spec['date'].replace('-', '.'), (1026, 1264), 16, True, mid, right=True)
    text(spec.get('surface', 'PROBNAYA.WORK').upper(), (56, 1305), 10, True, mid, spacing=1)
    im.save(spec['output'])
