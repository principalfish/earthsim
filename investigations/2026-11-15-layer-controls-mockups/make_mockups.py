"""Draws three candidate layouts for the layer controls as PNG mock-ups."""
import sys
import cairosvg

BG, PANEL, BORDER = "#0b0e14", "#141922", "#262d3a"
TEXT, MUTED, ACCENT = "#d7dce5", "#98a2b3", "#5aa9e6"
FONT = "DejaVu Sans"
H = 520


def text(x, y, s, size=11, fill=TEXT, anchor="start", weight="normal"):
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}" font-weight="{weight}">{s}</text>')


def box(x, y, w, h, fill=BG, stroke=BORDER, opacity=0.88, r=6, sw=1):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" '
            f'fill-opacity="{opacity}" stroke="{stroke}" stroke-width="{sw}"/>')


ICONS = {
    "terrain": '<path d="M3 19 L9 8 L13 14 L16 10 L21 19 Z" fill="none" stroke="{c}" stroke-width="1.8" stroke-linejoin="round"/>',
    "temp": '<path d="M12 4 V14" stroke="{c}" stroke-width="3.2" stroke-linecap="round"/><circle cx="12" cy="17.5" r="3.6" fill="{c}"/>',
    "pressure": '<path d="M4 17 A8 8 0 0 1 20 17" fill="none" stroke="{c}" stroke-width="1.8" stroke-linecap="round"/><path d="M12 17 L16.5 10" stroke="{c}" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1.6" fill="{c}"/>',
    "wind": '<path d="M3 8 h10 a2.5 2.5 0 1 0 -2.5 -2.5 M3 12.5 h15 a2.5 2.5 0 1 1 -2.5 2.5 M3 17 h7" fill="none" stroke="{c}" stroke-width="1.8" stroke-linecap="round"/>',
    "sun": '<circle cx="12" cy="12" r="4" fill="none" stroke="{c}" stroke-width="1.8"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="{c}" stroke-width="1.8" stroke-linecap="round"/>',
    "grid": '<rect x="4" y="4" width="16" height="16" fill="none" stroke="{c}" stroke-width="1.8"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" stroke="{c}" stroke-width="1.4"/>',
    "pause": '<rect x="6" y="5" width="4" height="14" fill="{c}"/><rect x="14" y="5" width="4" height="14" fill="{c}"/>',
    "play": '<path d="M7 4.5 L19 12 L7 19.5 Z" fill="{c}"/>',
    "layers": '<path d="M12 3 L21 8 L12 13 L3 8 Z M3 12 L12 17 L21 12 M3 16 L12 21 L21 16" fill="none" stroke="{c}" stroke-width="1.8" stroke-linejoin="round"/>',
}


def icon(name, x, y, size=22, c=TEXT):
    k = size / 24
    return f'<g transform="translate({x},{y}) scale({k})">{ICONS[name].format(c=c)}</g>'


def state(on):
    return (ACCENT, 0.22, ACCENT, 1.6) if on else (BG, 0.88, BORDER, 1)


def tile_v(x, y, name, label, on=False, w=74, h=54):
    f, o, s, sw = state(on)
    out = box(x, y, w, h, f, s, o, sw=sw) + icon(name, x + w / 2 - 11, y + 7)
    return out + text(x + w / 2, y + h - 8, label, 10, TEXT, "middle")


def tile_i(x, y, name, on=False, w=40, h=38):
    f, o, s, sw = state(on)
    return box(x, y, w, h, f, s, o, sw=sw) + icon(name, x + w / 2 - 11, y + h / 2 - 11)


def tile_h_w(label):
    return round(36 + len(label) * 6.3 + 10)


def tile_h(x, y, name, label, on=False, h=34):
    w = tile_h_w(label)
    f, o, s, sw = state(on)
    out = box(x, y, w, h, f, s, o, sw=sw) + icon(name, x + 8, y + 6)
    return out + text(x + 36, y + 21, label, 10.5), w


def row_h(x, y, items):
    out = ""
    for name, label, on in items:
        s, w = tile_h(x, y, name, label, on)
        out += s
        x += w + 6
    return out, x - 6


def heading(x, y, s):
    return text(x, y, s, 8.5, MUTED, weight="bold")


def select(x, y, label="Month ▾", w=92):
    return box(x, y, w, 26) + text(x + 10, y + 17, label, 10.5)


def segmented(x, y):
    out, cells = "", [("Simulated", 74, True), ("Observed", 70, False), ("Difference", 78, False)]
    for label, w, on in cells:
        f, o, s, sw = state(on)
        out += box(x, y, w, 26, f, s, o, r=4, sw=sw) + text(x + w / 2, y + 17, label, 10, TEXT, "middle")
        x += w
    return out


def sub_options(x, y, stacked=False):
    out = text(x, y + 17, "Show", 10, MUTED) + select(x + 34, y)
    if stacked:
        return out + segmented(x, y + 32)
    return out + segmented(x + 34 + 92 + 10, y)


SUB_W = 34 + 92 + 10 + 222


def pause(x, y, label=True):
    if label:
        return box(x, y, 78, 28) + icon("pause", x + 8, y + 5, 18) + text(x + 31, y + 18, "Pause", 10.5)
    return box(x, y, 34, 28) + icon("pause", x + 8, y + 5, 18)


def timeline(x, y, w):
    out = box(x, y, w, 34) + box(x + 4, y + 4, 28, 26, PANEL, BORDER, 1, 4) + icon("play", x + 9, y + 8, 18)
    left, right = x + 52, x + w - 18
    out += f'<line x1="{left}" y1="{y + 27}" x2="{right}" y2="{y + 27}" stroke="{BORDER}" stroke-width="2"/>'
    for i, m in enumerate("JFMAMJJASOND"):
        cx = left + (right - left) * i / 11
        if i == 6:
            out += f'<rect x="{cx - 11}" y="{y + 5}" width="22" height="18" rx="4" fill="{ACCENT}" fill-opacity="0.3" stroke="{ACCENT}"/>'
            out += f'<circle cx="{cx}" cy="{y + 27}" r="4" fill="{ACCENT}"/>'
        out += text(cx, y + 18, m, 10, TEXT if i == 6 else MUTED, "middle")
    return out


INFO_H = 136


def info(x, y, w):
    out = box(x, y, w, INFO_H)
    out += text(x + 10, y + 18, "Air temperature in July, °C", 11, TEXT, weight="bold")
    out += f'<rect x="{x + 10}" y="{y + 26}" width="{w - 20}" height="9" rx="2" fill="url(#ramp)"/>'
    for i, t in enumerate(["−40", "−20", "0", "20", "40"]):
        out += text(x + 10 + (w - 20) * i / 4, y + 47, t, 9, MUTED, "start" if i == 0 else "end" if i == 4 else "middle")
    out += icon("wind", x + 10, y + 54, 14, MUTED) + text(x + 29, y + 65, "Faster, longer streaks are stronger winds", 9, MUTED)
    out += f'<circle cx="{x + 14}" cy="{y + 79}" r="3" fill="#6fcf97"/>' + text(x + 23, y + 82, "Up to date", 9.5, MUTED)
    out += f'<line x1="{x + 8}" y1="{y + 92}" x2="{x + w - 8}" y2="{y + 92}" stroke="{BORDER}"/>'
    out += text(x + 10, y + 108, "27.9° N, 86.9° E · 1,234 m", 10)
    out += text(x + 10, y + 124, "18 °C · 7 m/s from the north-east", 10)
    return out


def globe(cx, cy, r):
    out = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#globe)"/>'
    for dx, dy, rot in [(-0.45, -0.3, -10), (0.1, -0.5, 8), (0.4, -0.1, 20), (-0.2, 0.15, -25), (0.25, 0.4, 15), (-0.5, 0.35, 5), (0.0, -0.1, -5)]:
        x, y = cx + dx * r, cy + dy * r
        out += (f'<path d="M{x - 12} {y} q12 -6 24 0" fill="none" stroke="#ffffff" stroke-opacity="0.55" '
                f'stroke-width="1.5" stroke-linecap="round" transform="rotate({rot} {x} {y})"/>')
    return out


def panel(x, w):
    out = f'<rect x="{x}" y="0" width="{w}" height="{H}" fill="{PANEL}"/><line x1="{x}" y1="0" x2="{x}" y2="{H}" stroke="{BORDER}"/>'
    out += text(x + 14, 28, "earth_sim", 13, TEXT, weight="bold")
    rows = ["World", "View", "Planet", "Tools", "Statistics", "Settings"]
    notes = {"View": "relief, sea level", "Settings": "units, arrows or streaks"}
    for i, name in enumerate(rows):
        y = 60 + i * 42
        out += f'<line x1="{x + 10}" y1="{y - 18}" x2="{x + w - 10}" y2="{y - 18}" stroke="{BORDER}"/>'
        out += text(x + 14, y, "▸ " + name, 11.5)
        if name in notes:
            out += text(x + 27, y + 14, notes[name], 9, MUTED)
    return out


LAYERS = [("terrain", "Terrain", False), ("temp", "Temperature", True), ("pressure", "Pressure", False)]
TOGGLES = [("wind", "Winds", True), ("sun", "Sunlight", False), ("grid", "Grid", False)]


def layout_a(g, narrow):
    out = ""
    if narrow:
        x0, m = 56, 8
        out += globe((x0 + g) / 2, 205, 128)
        for i, (n, _, on) in enumerate(LAYERS):
            out += tile_i(m, 8 + i * 42, n, on)
        out += f'<line x1="{m + 4}" y1="139" x2="{m + 36}" y2="139" stroke="{MUTED}"/>'
        for i, (n, _, on) in enumerate(TOGGLES):
            out += tile_i(m, 146 + i * 42, n, on)
        out += sub_options(x0, 8, stacked=True) + pause(g - m - 34, 8, label=False)
    else:
        x0, m = 94, 10
        out += globe((x0 + g) / 2, 232, 178)
        out += heading(m, 19, "COLOUR")
        for i, (n, l, on) in enumerate(LAYERS):
            out += tile_v(m, 25 + i * 60, n, l, on)
        out += heading(m, 219, "OVERLAYS")
        for i, (n, l, on) in enumerate(TOGGLES):
            out += tile_v(m, 225 + i * 60, n, l, on)
        out += sub_options(x0, 10) + pause(g - m - 78, 10)
    iw = g - x0 - m if narrow else 250
    out += info(g - m - iw, H - 44 - m - INFO_H, iw) + timeline(x0, H - 44, g - x0 - m)
    return out


def layout_b(g, narrow):
    out = ""
    if narrow:
        m = 8
        out += globe(g / 2, 232, 104)
        s, _ = row_h(m, 8, LAYERS)
        out += s + pause(g - m - 34, 11, label=False)
        s, _ = row_h(m, 48, TOGGLES)
        out += s + sub_options(m, 90)
        iw = g - 2 * m
    else:
        m = 10
        out += globe(g / 2, 268, 172)
        s, _ = row_h(m, 10, LAYERS)
        out += s
        tw = sum(tile_h_w(l) for _, l, _ in TOGGLES) + 12
        s, end = row_h(g - m - 78 - 14 - tw, 10, TOGGLES)
        out += s + pause(g - m - 78, 13) + sub_options(m, 52)
        iw = 250
    out += info(g - m - iw, H - 44 - m - INFO_H, iw) + timeline(m, H - 44, g - 2 * m)
    return out


def chip(x, y, s):
    w = round(len(s) * 6.1 + 20)
    return box(x, y, w, 26, r=13) + text(x + 10, y + 17, s, 10.5)


def layout_c(g, narrow):
    out = ""
    m = 8 if narrow else 10
    iw = g - 2 * m if narrow else 250
    iy = H - 44 - m - INFO_H
    if narrow:
        out += globe(g / 2, 160, 122)
        out += chip(m, m, "Temperature · July · Winds") + pause(g - m - 34, m, label=False)
        out += tile_v(m, iy - m - 54, "layers", "Layers", w=66)
    else:
        out += globe(g / 2, 212, 176)
        out += chip(m, m, "Temperature · July · Winds") + pause(g - m - 78, m)
        ty = H - 44 - m - 54
        out += tile_v(m, ty, "layers", "Layers", on=True, w=66)
        tx, tw, th = m + 70, 366, 158
        tray_y = H - 44 - m - th
        out += box(tx, tray_y, tw, th, PANEL, BORDER, 0.97)
        for i, (n, l, on) in enumerate(LAYERS):
            out += tile_v(tx + 8 + i * 80, tray_y + 8, n, l, on)
        s, _ = row_h(tx + 8, tray_y + 70, TOGGLES)
        out += s + sub_options(tx + 8, tray_y + 114)
    out += info(g - m - iw, iy, iw) + timeline(m, H - 44, g - 2 * m)
    return out


DEFS = f'''<defs>
<radialGradient id="globe" cx="42%" cy="40%" r="65%">
<stop offset="0" stop-color="#e8743b"/><stop offset="0.3" stop-color="#f2c14e"/>
<stop offset="0.55" stop-color="#7fc97f"/><stop offset="0.8" stop-color="#3b7dd8"/><stop offset="1" stop-color="#1b3a8a"/>
</radialGradient>
<linearGradient id="ramp" x1="0" x2="1" y1="0" y2="0">
<stop offset="0" stop-color="#1b3a8a"/><stop offset="0.3" stop-color="#3b7dd8"/><stop offset="0.5" stop-color="#7fc97f"/>
<stop offset="0.75" stop-color="#f2c14e"/><stop offset="1" stop-color="#e8743b"/>
</linearGradient></defs>'''


def frame(x, y, w, inner, clip_id):
    return (f'<clipPath id="{clip_id}"><rect x="0" y="0" width="{w}" height="{H}" rx="8"/></clipPath>'
            f'<g transform="translate({x},{y})"><g clip-path="url(#{clip_id})">'
            f'<rect x="0" y="0" width="{w}" height="{H}" fill="{BG}"/>{inner}</g>'
            f'<rect x="0" y="0" width="{w}" height="{H}" rx="8" fill="none" stroke="{MUTED}" stroke-opacity="0.6"/></g>')


def sheet(title, note, layout, path):
    gw, pw, nw = 710, 190, 420
    total_w, total_h = 20 + gw + pw + 30 + nw + 20, 96 + H + 20
    desk = layout(gw, False) + panel(gw, pw)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{total_h}">{DEFS}'
           f'<rect width="100%" height="100%" fill="#05070b"/>'
           + text(20, 32, title, 19, TEXT, weight="bold") + text(20, 54, note, 12, MUTED)
           + text(20, 86, "Desktop window", 11, MUTED)
           + text(20 + gw + pw + 30, 86, "Narrow window: the globe’s area at 420 px (side panel not drawn)", 11, MUTED)
           + frame(20, 96, gw + pw, desk, "c1") + frame(20 + gw + pw + 30, 96, nw, layout(nw, True), "c2") + '</svg>')
    cairosvg.svg2png(bytestring=svg.encode(), write_to=path, scale=1.4)


out = sys.argv[1]
sheet("A · Tiles down the left edge", "Always visible. Layers are one choice, overlays are toggles. In a narrow window the labels drop and only icons stay.", layout_a, f"{out}/layout-a-left-edge.png")
sheet("B · Tiles along the top", "Always visible. Layers on the left, overlays on the right. In a narrow window the row wraps into three.", layout_b, f"{out}/layout-b-top.png")
sheet("C · One Layers tile and a tray", "As Google Maps: the tray (shown open on the left, closed on the right) holds everything; a chip says what is showing.", layout_c, f"{out}/layout-c-tray.png")
