"""Draws the earth_sim climate process diagram as a one-page PDF."""

import sys

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

OUT = sys.argv[1]
W, H = landscape(A4)

INK = HexColor("#1f2933")
MUTED = HexColor("#52606d")
LOOP_FILL = HexColor("#e6f0fa")
LOOP_EDGE = HexColor("#2f6fad")
BOX_FILL = HexColor("#ffffff")
INPUT_FILL = HexColor("#f3f0e6")
INPUT_EDGE = HexColor("#8a7a4a")
DOWN_FILL = HexColor("#e8f4e8")
DOWN_EDGE = HexColor("#3f8a4b")
SIDE_FILL = HexColor("#f5f6f8")
SIDE_EDGE = HexColor("#9aa5b1")
FORWARD = HexColor("#323f4b")
FEEDBACK = HexColor("#c2571a")

c = canvas.Canvas(OUT, pagesize=landscape(A4))
c.setTitle("earth_sim: how the climate is worked out")
c.setAuthor("earth_sim planning")


def box(x, y, w, h, lines, fill=BOX_FILL, edge=LOOP_EDGE, bold_first=True, size=9.5):
    """A rounded box with centred lines of text; the first line bold."""
    c.setFillColor(fill)
    c.setStrokeColor(edge)
    c.setLineWidth(1.1)
    c.roundRect(x, y, w, h, 6, fill=1, stroke=1)
    leading = size + 2.5
    total = leading * len(lines)
    top = y + h / 2 + total / 2 - size + 1
    for index, line in enumerate(lines):
        bold = bold_first and index == 0
        c.setFont("Helvetica-Bold" if bold else "Helvetica", size if bold else size - 1)
        c.setFillColor(INK if bold else MUTED)
        c.drawCentredString(x + w / 2, top - index * leading, line)


def head(x, y, dx, dy, colour):
    """An arrow head at (x, y) pointing along (dx, dy), a unit axis direction."""
    size = 5.5
    c.setFillColor(colour)
    c.setStrokeColor(colour)
    path = c.beginPath()
    path.moveTo(x, y)
    path.lineTo(x - dx * size - dy * size * 0.55, y - dy * size - dx * size * 0.55)
    path.lineTo(x - dx * size + dy * size * 0.55, y - dy * size + dx * size * 0.55)
    path.close()
    c.drawPath(path, fill=1, stroke=0)


def arrow(points, colour=FORWARD, width=1.3):
    """A line through the points, each leg along an axis, with a head at the end."""
    c.setStrokeColor(colour)
    c.setLineWidth(width)
    path = c.beginPath()
    path.moveTo(*points[0])
    for point in points[1:]:
        path.lineTo(*point)
    c.drawPath(path, fill=0, stroke=1)
    (x1, y1), (x2, y2) = points[-2], points[-1]
    dx = (x2 > x1) - (x2 < x1)
    dy = (y2 > y1) - (y2 < y1)
    head(x2, y2, dx, dy, colour)


def label(x, y, text, colour=MUTED, size=8, bold=False, centred=False):
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.setFillColor(colour)
    if centred:
        c.drawCentredString(x, y, text)
    else:
        c.drawString(x, y, text)


# Title.
label(40, 560, "earth_sim: how the climate is worked out", INK, 16, bold=True)
label(
    40,
    544,
    "The design once the biome map (roadmap step 8) is built. Drawn 14 November 2026.",
    MUTED,
    9.5,
)

# Inputs.
box(150, 492, 220, 30, ["Star, orbit, tilt, day length"], INPUT_FILL, INPUT_EDGE)
box(400, 492, 160, 30, ["Terrain and sea level"], INPUT_FILL, INPUT_EDGE)
arrow([(260, 492), (260, 472)])
arrow([(480, 492), (480, 472)])

# The loop.
c.setFillColor(LOOP_FILL)
c.setStrokeColor(LOOP_EDGE)
c.setLineWidth(1.6)
c.roundRect(40, 250, 560, 220, 10, fill=1, stroke=1)
label(54, 453, "THE LOOP", LOOP_EDGE, 10.5, bold=True)
label(112, 453, "repeats until the temperature stops changing", LOOP_EDGE, 9.5)

box(60, 330, 130, 50, ["Temperature", "twelve months"])
box(240, 335, 100, 40, ["Pressure"])
box(370, 335, 90, 40, ["Winds"])
box(490, 335, 95, 40, ["Ocean currents"])
box(60, 265, 130, 40, ["Sea ice and", "snow cover"], bold_first=False)
# Make both lines of the sea-ice box bold, as it is one name.
c.setFont("Helvetica-Bold", 9.5)
c.setFillColor(INK)
c.setFillColor(BOX_FILL)
c.setStrokeColor(LOOP_EDGE)
c.roundRect(60, 265, 130, 40, 6, fill=1, stroke=1)
c.setFillColor(INK)
c.drawCentredString(125, 288, "Sea ice and")
c.drawCentredString(125, 276, "snow cover")

# Forward steps inside the loop.
arrow([(190, 355), (240, 355)])
arrow([(340, 355), (370, 355)])
arrow([(460, 355), (490, 355)])
arrow([(100, 330), (100, 305)])

# Feedback into the temperature.
arrow([(415, 375), (415, 404), (150, 404), (150, 380)], FEEDBACK, 1.5)
label(282, 408, "heat carried by winds", FEEDBACK, 8.5, centred=True)
arrow([(537, 375), (537, 430), (100, 430), (100, 380)], FEEDBACK, 1.5)
label(318, 434, "heat carried by currents", FEEDBACK, 8.5, centred=True)
arrow([(150, 305), (150, 330)], FEEDBACK, 1.5)
label(200, 321, "Ice and snow form where it is cold.", MUTED, 8.5)
label(200, 310, "They reflect sunlight, which cools it further.", FEEDBACK, 8.5)
label(200, 285, "Sea ice and snow cover do not drive the currents;", MUTED, 8)
label(200, 275, "they act on the temperature only.", MUTED, 8)

# The settled state and what is worked out from it.
c.setStrokeColor(FORWARD)
c.setLineWidth(1.3)
c.line(320, 250, 320, 236)
c.line(240, 236, 490, 236)
arrow([(240, 236), (240, 220)])
arrow([(490, 236), (490, 220)])
label(328, 241, "the settled state", INK, 9, bold=True)

box(150, 180, 180, 40, ["Rain and snowfall", "from winds and temperature"], DOWN_FILL, DOWN_EDGE)
box(400, 180, 180, 40, ["Storm zones", "from sea temperature and winds"], DOWN_FILL, DOWN_EDGE)
arrow([(240, 180), (240, 150)])
box(160, 110, 160, 40, ["Climate zones", "from temperature and rain"], DOWN_FILL, DOWN_EDGE)
arrow([(320, 130), (360, 130)])
box(360, 110, 160, 40, ["Biome map", "from temperature and rain"], DOWN_FILL, DOWN_EDGE)

# Right column: the layers.
c.setFillColor(SIDE_FILL)
c.setStrokeColor(SIDE_EDGE)
c.setLineWidth(1)
c.roundRect(620, 330, 192, 140, 8, fill=1, stroke=1)
label(632, 453, "Layers you can view", INK, 10.5, bold=True)
label(632, 436, "From the loop", LOOP_EDGE, 9, bold=True)
for index, text in enumerate(
    ["Temperature", "Pressure", "Winds", "Ocean currents", "Sea ice"]
):
    label(640, 424 - index * 11, text, INK, 8.5)
label(726, 436, "Downstream", DOWN_EDGE, 9, bold=True)
for index, text in enumerate(["Rainfall", "Climate zones", "Storm zones", "Biomes"]):
    label(734, 424 - index * 11, text, INK, 8.5)

# Right column: outside the loop.
c.setFillColor(SIDE_FILL)
c.setStrokeColor(SIDE_EDGE)
c.roundRect(620, 180, 192, 130, 8, fill=1, stroke=1)
label(632, 293, "Outside the loop,", INK, 10.5, bold=True)
label(632, 280, "stepping through time", INK, 10.5, bold=True)
for index, text in enumerate(
    [
        "Ice sheets grow over thousands",
        "of years (step 6). Plates move",
        "over millions (step 9).",
        "",
        "They change the terrain and the",
        "ice cover, and the loop is then",
        "run again as a snapshot.",
    ]
):
    label(632, 263 - index * 11, text, MUTED, 8.5)

# Legend.
arrow([(40, 78), (76, 78)])
label(82, 75, "feeds the next step", MUTED, 8.5)
arrow([(190, 78), (226, 78)], FEEDBACK, 1.5)
label(232, 75, "feeds back into the temperature", FEEDBACK, 8.5)

# Status.
label(40, 52, "Built today (step 3, in progress):", INK, 8.5, bold=True)
label(
    187,
    52,
    "temperature, pressure and winds, worked out once in that order, with no feedback.",
    MUTED,
    8.5,
)
label(40, 40, "Planned, not built:", INK, 8.5, bold=True)
label(
    125,
    40,
    "the loop and heat carried by winds (3b), rain (4), ocean currents (5), ice (6), storm zones (7), biomes (8).",
    MUTED,
    8.5,
)

c.showPage()
c.save()
