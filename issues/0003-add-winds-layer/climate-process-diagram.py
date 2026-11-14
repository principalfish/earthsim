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

# ---------------------------------------------------------------------------
# The settings pages: every number the two models are tuned by.
# ---------------------------------------------------------------------------
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle

SETTINGS_DATE = "14 November 2026"

CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=8, leading=10, textColor=INK)
NAME = ParagraphStyle("name", fontName="Courier", fontSize=7.6, leading=10, textColor=INK)
HEADER = ParagraphStyle("header", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=INK)
GROUP = ParagraphStyle("group", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=LOOP_EDGE)
TUNED = ParagraphStyle("tuned", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=FEEDBACK)

EARTH = "Tuned against the Earth"

# (group, [(name, value, what it does, where it comes from, tuned?)])
WIND = [
    ("Width of the cells", [
        ("earthContrastK", "41 K", "The Earth's equator-to-pole temperature contrast: the yardstick other planets' contrast is measured against.", "The simulated Earth", ""),
        ("rotationPower", "0.5", "How the cells' width follows the day length: the square-root rule.", "Published theory (Held, 2000)", ""),
        ("contrastPower", "0.25", "How the cells' width follows the temperature contrast.", "A guess from theory", ""),
        ("minContrastRatio", "0.25", "The least contrast taken, so cells keep a sane width on a planet with almost none.", "A guess", ""),
        ("maxContrastRatio", "4", "The most contrast taken, so cells keep a sane width on a planet with a huge one.", "A guess", ""),
    ]),
    ("Where the central low sits", [
        ("hotWindowK", "4 K", "How the warmest latitude is averaged, so the low does not jump between two warm bands.", "Started at 2", EARTH),
        ("lowShiftGain", "2.5", "Pushes the low further from the equator than the warmest latitude. Makes up for the temperature model's weak seasons.", "1 is the plain rule", EARTH),
        ("lowShiftFadeDeg", "20 deg", "The latitude over which that push fades away.", "A guess", ""),
        ("edgeShiftShare", "0.5", "How far the subtropical highs follow the low off the equator.", "The observed Earth", ""),
        ("lowLimitDeg", "70 deg", "The farthest the low may sit from the equator at the Earth's spin or faster.", "Our choice, after two papers", ""),
        ("lowLimitFromWidthDeg", "30 deg", "The cell width up to which that limit is 70 degrees: the Earth's.", "Our choice", ""),
        ("lowLimitToWidthDeg", "60 deg", "The cell width from which the limit is the pole: a 4-day day.", "Our choice, after a paper's slow case", ""),
        ("lowLimitEaseShare", "0.5", "How gently the low is held short of its limit.", "A guess", ""),
    ]),
    ("Steep tilts", [
        ("minSummerCellShare", "0.3", "The narrowest the tropical cell may be on the summer side of the low.", "A guess", ""),
        ("wideSummerFromShare", "0.4", "How far out the low lies when that summer side starts to widen again.", "Set by hand", "Set against the 60-degree tilt case"),
        ("wideSummerToShare", "0.8", "How far out the low lies when the summer side is a whole cell again.", "Set by hand", "Set against the 60-degree tilt case"),
        ("sideContrastK", "30 K", "How much cooler a pole must be than the low for that side's bands to be at full strength.", "Started at 20", "Set against the 60-degree tilt case"),
    ]),
    ("Strength of the bands", [
        ("bandAmplitudeHpa", "9 hPa", "How strong the pressure bands are, and so how fast the trades and westerlies blow.", "Started at 5", EARTH),
        ("outerCellShare", "0.3", "The strength kept by bands far from the low; the real polar easterlies are weak.", "Started at 1", EARTH),
        ("fullBandsReachDeg", "60 deg", "On a planet spinning faster than the Earth, how far from the low the bands keep full strength.", "Our choice", ""),
        ("poleTaperDeg", "10 deg", "The distance from each pole over which the bands ease out.", "Started at 15", "Set by hand, not against the Earth"),
    ]),
    ("Highs and lows over land and sea", [
        ("thermalHpaPerK", "3 hPa/K", "Pressure added for each degree a place is colder than its latitude. Makes up for the temperature model's weak land and sea contrasts.", "Physics suggests 0.7", EARTH),
        ("thermalSmoothingKm", "900 km", "How far those highs and lows are smoothed.", "Started at 750", EARTH),
        ("seaThermalShare", "0.3", "The share of that response the sea gets, against land.", "Was 1", EARTH),
        ("warmLimitK", "6 K", "Caps how deep a hot place's low gets.", "No limit before", EARTH),
        ("coldKneeK", "20 K", "A cold place's high grows in full up to this many degrees below its latitude.", "A guard for extreme worlds", ""),
        ("coldLimitK", "25 K", "The most cold a high counts, however cold the place.", "A guard for extreme worlds", ""),
        ("thermalHeightM", "2,500 m", "Fades the response over high ground, so a cold plateau is not a false high.", "No fade before", EARTH),
    ]),
    ("The wind from the pressure", [
        ("seaFrictionPerS", "2.5e-5 /s", "Friction over the sea: how far the wind cuts across the pressure lines.", "Started at 3.7e-5", EARTH),
        ("landFrictionFactor", "5", "How many times more friction land has: the wind's speed over land.", "Started at 2", EARTH),
        ("blockingSlope", "0.005", "The slope of the ground at which mountains turn half the wind along them.", "A guess", ""),
    ]),
]

TEMPERATURE = [
    ("How heat moves and is stored", [
        ("diffusivity", "0.55 W/m2/K", "How readily heat spreads between neighbouring places.", "Published (North, Cahalan and Coakley, 1981), a little below", ""),
        ("landDiffusivity", "0.35 W/m2/K", "The same over land: lower, so continents keep more of their own seasons.", "Started at the sea's value", EARTH),
        ("oceanHeatCapacity", "2.5e8 J/m2/K", "The heat the sea stores: a mixed layer of 60 m of sea water.", "A physical figure", ""),
        ("landHeatCapacity", "1e7 J/m2/K", "The heat land stores: about the column of air above it alone.", "As simple seasonal models take it", ""),
        ("seaIceHeatCapacity", "1e7 J/m2/K", "The heat sea ice stores: as land, since ice insulates the water below.", "Chosen; without it the Arctic winter is 10 K too warm", ""),
        ("lapseRate", "6.5 K/km", "How fast it cools with height.", "The standard atmosphere", ""),
        ("greenhouseFactor", "0.633", "How much outgoing heat the air holds back at the Earth's greenhouse strength.", "The Earth's energy budget", ""),
    ]),
    ("Reflected sunlight", [
        ("albedo", "0.27", "The share of sunlight reflected, on average, by ground clear of ice.", "Set to the observed global mean", EARTH),
        ("albedoPoleward", "0.078", "How much more is reflected towards the poles.", "Published form, tuned", EARTH),
        ("landAlbedoExtra", "0", "Extra reflection over land. Left at zero, for tuning.", "No starting point", ""),
        ("iceAlbedo", "0.62", "The share reflected by ice and snow.", "Published form, tuned", EARTH),
        ("iceStartC", "0 C", "The temperature at which ice starts to come in.", "A smooth ramp, not a single temperature", ""),
        ("iceFullC", "-10 C", "The temperature at which a place is fully ice.", "A smooth ramp, not a single temperature", ""),
    ]),
    ("The solver (numerical, not physical)", [
        ("stepsPerMonth", "2", "Time steps in each month.", "Chosen by measurement", ""),
        ("solverToleranceK", "0.005 K", "How closely each step's heat balance is solved.", "Chosen by measurement", ""),
        ("solverMaxIterations", "200", "Stops a solve that would not converge; it normally needs 5 to 25.", "A safety limit", ""),
        ("terrainDriftLimitK", "0.25 K", "How far the terrain may change before the temperature is solved from nothing again.", "Chosen, not derived", ""),
        ("correctionRefineK", "1 K", "The year-end correction below which later passes are skipped.", "Chosen by measurement", ""),
    ]),
]

COLS = [150, 72, 300, 150, 110]


def settings_table(groups):
    rows = [[Paragraph(h, HEADER) for h in ("Setting", "Value", "What it does", "Where it comes from", "Tuned?")]]
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.9, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    for group, settings in groups:
        rows.append([Paragraph(group, GROUP), "", "", "", ""])
        index = len(rows) - 1
        style.append(("SPAN", (0, index), (-1, index)))
        style.append(("BACKGROUND", (0, index), (-1, index), LOOP_FILL))
        # Keep a group's heading on the same page as its first setting.
        style.append(("NOSPLIT", (0, index), (-1, index + 1)))
        for name, value, what, source, tuned in settings:
            rows.append([
                Paragraph(name, NAME),
                Paragraph(value, CELL),
                Paragraph(what, CELL),
                Paragraph(source, CELL),
                Paragraph(tuned, TUNED if tuned == EARTH else CELL),
            ])
            style.append(("LINEBELOW", (0, len(rows) - 1), (-1, len(rows) - 1), 0.25, SIDE_EDGE))
    table = Table(rows, colWidths=COLS, repeatRows=1)
    table.setStyle(TableStyle(style))
    return table


def settings_pages(title, intro, groups):
    """Draws a model's settings table over as many pages as it needs."""
    table = settings_table(groups)
    first = True
    while table is not None:
        top = 560
        label(40, top, title if first else title + " (continued)", INK, 14, bold=True)
        if first:
            label(40, top - 15, intro, MUTED, 9)
        available = (top - 26 if first else top - 12) - 40
        parts = table.split(W - 60, available)
        part = parts[0]
        _, height = part.wrapOn(c, W - 60, available)
        part.drawOn(c, 30, (top - 26 if first else top - 12) - height)
        table = parts[1] if len(parts) > 1 else None
        first = False
        c.showPage()


settings_pages(
    "The wind model's settings",
    "The 31 numbers the wind model is built on, as of " + SETTINGS_DATE
    + " (piece 7c-1, in review). In orange: the 11 tuned by hand against the observed Earth.",
    WIND,
)
settings_pages(
    "The temperature model's settings",
    "The 18 numbers the temperature model is built on, as of " + SETTINGS_DATE
    + ": 13 physical and 5 for the solver. In orange: tuned against the observed Earth.",
    TEMPERATURE,
)
c.save()
