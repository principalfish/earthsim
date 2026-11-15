"""Draws the earth_sim climate process diagram, then the settings of the
temperature and wind models, as a landscape A4 PDF.

Run with the PDF to write as its one argument:

    python scripts/docs/climate-process.py docs/climate-process.pdf

It needs the reportlab library. The output is the same, byte for byte, on
every run with nothing changed.
"""

import sys
from dataclasses import dataclass

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

# The date the diagram and the settings pages were drawn, on every page.
DRAWN = "15 November 2026"

if len(sys.argv) != 2:
    sys.exit("Usage: climate-process.py <output.pdf>")
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

# invariant=1 leaves out the creation time and the random document id, so
# that the same input always writes the same bytes.
c = canvas.Canvas(OUT, pagesize=landscape(A4), invariant=1)
c.setTitle("earth_sim: how the climate is worked out")
c.setAuthor("earth_sim")


def box(
    x: float,
    y: float,
    w: float,
    h: float,
    lines: list[str],
    fill: Color = BOX_FILL,
    edge: Color = LOOP_EDGE,
    bold_first: bool = True,
    size: float = 9.5,
) -> None:
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


def head(x: float, y: float, dx: int, dy: int, colour: Color) -> None:
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


def arrow(
    points: list[tuple[float, float]],
    colour: Color = FORWARD,
    width: float = 1.3,
) -> None:
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


def label(
    x: float,
    y: float,
    text: str,
    colour: Color = MUTED,
    size: float = 8,
    bold: bool = False,
    centred: bool = False,
) -> None:
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.setFillColor(colour)
    if centred:
        c.drawCentredString(x, y, text)
    else:
        c.drawString(x, y, text)


def lead_line(y: float, lead: str, text: str, size: float = 8.5) -> None:
    """A bold lead-in at the left margin, then plain text just after it."""
    label(40, y, lead, INK, size, bold=True)
    label(40 + c.stringWidth(lead, "Helvetica-Bold", size) + 6, y, text, MUTED, size)


# Title.
label(40, 560, "earth_sim: how the climate is worked out", INK, 16, bold=True)
label(
    40,
    544,
    f"The design once biomes are worked out. Drawn {DRAWN}.",
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

box(
    150,
    180,
    180,
    40,
    ["Rain and snowfall", "from winds and temperature"],
    DOWN_FILL,
    DOWN_EDGE,
)
box(
    400,
    180,
    180,
    40,
    ["Storm zones", "from sea temperature and winds"],
    DOWN_FILL,
    DOWN_EDGE,
)
arrow([(240, 180), (240, 150)])
box(
    160,
    110,
    160,
    40,
    ["Climate zones", "from temperature and rain"],
    DOWN_FILL,
    DOWN_EDGE,
)
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
        "of years. Plates move over",
        "millions.",
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
lead_line(
    52,
    "Built today:",
    "temperature, then pressure, then winds, each worked out once in that order,"
    " with no feedback.",
)
lead_line(
    40,
    "Planned, not built:",
    "the loop and heat carried by winds, rain, ocean currents, ice, storm zones,"
    " biomes.",
)

c.showPage()

# ---------------------------------------------------------------------------
# The settings pages: every number the two models are built on, with what
# raising or lowering each one does. Kept by hand: bring them up to the code
# in src/core/wind/rules.ts and src/core/temperature.ts when a setting changes.
# ---------------------------------------------------------------------------
CELL = ParagraphStyle(
    "cell", fontName="Helvetica", fontSize=7.4, leading=9, textColor=INK
)
NAME = ParagraphStyle(
    "name", fontName="Courier", fontSize=7.2, leading=9, textColor=INK
)
HEADER = ParagraphStyle(
    "header", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=INK
)
GROUP = ParagraphStyle(
    "group", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=LOOP_EDGE
)
TUNED = ParagraphStyle(
    "tuned", fontName="Helvetica-Bold", fontSize=7.4, leading=9, textColor=FEEDBACK
)

EARTH = "Tuned against the Earth"


@dataclass(frozen=True, slots=True)
class Setting:
    """One of a model's settings, as its row in the table shows it."""

    name: str
    value: str
    controls: str
    raising: str
    lowering: str
    source: str
    tuned: bool = False


Group = tuple[str, list[Setting]]

WIND: list[Group] = [
    (
        "How wide the circulation cells are",
        [
            Setting(
                "earthContrastK",
                "41 K",
                "The Earth's temperature difference from its hottest latitude to"
                " its poles. Every planet's difference is measured against it to"
                " set how wide its circulation cells are.",
                "Every planet's difference counts as smaller, so its cells come"
                " out narrower: the subtropical highs and the bands beyond move"
                " towards the equator, and the bands weaken a little, as their"
                " strength follows the width. At 50 K the Earth's 30° cells would"
                " narrow to about 28.5°.",
                "The opposite: wider cells, the highs further from the equator,"
                " and slightly stronger bands.",
                "The simulated Earth's own difference: 41.8 K in January and"
                " 39.9 K in July. Not tuned.",
            ),
            Setting(
                "rotationPower",
                "0.5",
                "How strongly the cells' width follows the length of the day: the"
                " width goes as (day length ÷ 24 hours) to this power.",
                "No change at the Earth's 24-hour day. A slower-turning planet"
                " gets wider cells and fewer bands, a faster one narrower cells"
                " and more bands. At 1, an 8-hour day would give cells of 10°"
                " rather than 17°.",
                "No change at the Earth's day. The day length matters less; at 0"
                " every planet has cells as wide as the Earth's, before its"
                " temperature difference is counted.",
                "Published theory: the square-root rule of Held (2000). Not tuned.",
            ),
            Setting(
                "contrastPower",
                "0.25",
                "How strongly the cells' width follows the planet's"
                " equator-to-pole temperature difference, against the Earth's.",
                "A planet with a larger difference than the Earth's gets wider"
                " cells, one with a smaller difference narrower cells. On the"
                " Earth, whose difference runs from 35 to 49 K through the year,"
                " the cells' width swings more than its 28.9° to 31.4° today.",
                "The difference matters less; at 0 it does not change the width"
                " at all.",
                "A guess from theory: the weaker of two published powers (Held"
                " 2000; Held and Hou 1980). Not tuned.",
            ),
            Setting(
                "minContrastRatio",
                "0.25",
                "The smallest temperature difference counted, as a share of the"
                " Earth's (about 10 K), so a planet with almost none, or a"
                " reversed one, still has cells of a sensible width.",
                "Planets whose difference falls below it get wider cells than"
                " their temperature gives. The Earth is untouched unless it is"
                " raised past about 0.86; the Earth tilted 60° is held by it"
                " already in October and November, when its difference falls to"
                " 9 K and below.",
                "Lets planets with very little difference have narrower cells."
                " Today the narrowest is about 0.7 of the Earth's width at the"
                " Earth's day length.",
                "A guess: a guard for extreme worlds. Not tuned.",
            ),
            Setting(
                "maxContrastRatio",
                "4",
                "The largest temperature difference counted, as a share of the"
                " Earth's (about 164 K), so a planet with a huge one still has"
                " cells of a sensible width.",
                "Does nothing until a planet's difference passes 4 times the"
                " Earth's. Such planets may then have still wider cells.",
                "Caps the width sooner on planets with a large difference. The"
                " Earth is untouched unless it is lowered below about 1.2. Today"
                " the widest is about 1.4 times the Earth's at the Earth's day"
                " length.",
                "A guess: a guard for extreme worlds. Not tuned.",
            ),
        ],
    ),
    (
        "Where the band of low pressure sits",
        [
            Setting(
                "hotWindowK",
                "4 K",
                "How close to the hottest temperature a latitude must be to count"
                " towards the hottest latitude, which places the band of low"
                " pressure. Latitudes within this many kelvin are averaged.",
                "Mixed: the low is placed from a broader warm belt, so it jumps"
                " less between two latitudes about as warm, and where it ends up"
                " depends on the belt's shape. From 2 to 4 K it moved the Earth's"
                " hottest latitude a little further from the equator; from 2 to"
                " 8 K, a run moved the Earth's tropical cell edges by 0.1° at most.",
                "The low follows the single warmest latitude more closely, and"
                " can jump between two latitudes about as warm as each other.",
                "Started at 2 K.",
                tuned=True,
            ),
            Setting(
                "lowShiftGain",
                "2.5",
                "How many times further from the equator than the hottest"
                " latitude the low sits, near the equator. It makes up for the"
                " temperature model's seasons being too weak.",
                "The low, and the subtropical highs with it, swing further into"
                " the summer hemisphere each year, giving stronger monsoons.",
                "The low stays nearer the equator. At 1 it sits at the hottest"
                " latitude itself, and South Asia has no south-westerly monsoon"
                " in July.",
                "1 is the plain rule.",
                tuned=True,
            ),
            Setting(
                "lowShiftFadeDeg",
                "20°",
                "The latitude over which that extra push fades. Well beyond it,"
                " the low sits at the hottest latitude itself.",
                "The push reaches further from the equator, so the low swings"
                " further wherever the hottest latitude lies well off it: over"
                " hot land, and on steeply tilted planets. Little change to the"
                " Earth's band as a whole, whose hottest latitude stays within"
                " about 6.5° of the equator, where the push is nearly whole.",
                "The push fades sooner and the low stays nearer the hottest"
                " latitude. Towards 5° it weakens the push on the Earth too, and"
                " the low moves back towards the equator.",
                "A guess. Not tuned.",
            ),
            Setting(
                "edgeShiftShare",
                "0.5",
                "How far the subtropical highs (the tropical cell's edges) follow"
                " the low off the equator, as a share of the low's move. It counts"
                " for less as the cells widen, and not at all once they reach the"
                " poles.",
                "The subtropical highs swing further north and south through the"
                " year with the low; at 1 they move as far as it does.",
                "The highs stay more nearly where they are while the low moves;"
                " at 0 they hardly move at all.",
                "The observed Earth: its subtropical highs move about half as far"
                " through the year as the low. Not tuned.",
            ),
            Setting(
                "lowLimitDeg",
                "70°",
                "The farthest from the equator the low may sit, on a planet"
                " turning as fast as the Earth or faster. It matters only at a"
                " steep tilt, where the hottest latitude can near a summer pole.",
                "The low may sit nearer the summer pole on steeply tilted worlds."
                " No effect on the Earth: its low never comes near the limit.",
                "The low is held nearer the equator on steeply tilted worlds."
                " The Earth's lows reach at most 23.5° from the equator (over land"
                " in August), so it would touch them only below about 46°.",
                "Our choice, after a paper by Guendelman and Kaspi on tilted"
                " planets, which gives no figure. Not tuned.",
            ),
            Setting(
                "lowLimitFromWidthDeg",
                "30°",
                "The cell width up to which that limit stays at 70°: the Earth's"
                " width, so every planet turning as fast as the Earth or faster"
                " keeps it. As cells widen beyond, the limit moves to the pole.",
                "Slower-turning planets keep the 70° limit too, so their low is"
                " held further from the summer pole. No effect on the Earth.",
                "The limit starts moving towards the pole even at the Earth's day"
                " length, so the low of the Earth tilted 60° could sit nearer its"
                " pole. No effect on the untilted Earth. Keep it below"
                " lowLimitToWidthDeg.",
                "Our choice: the Earth's cell width. Not tuned.",
            ),
            Setting(
                "lowLimitToWidthDeg",
                "60°",
                "The cell width from which the low may reach the pole: the width"
                " at a 4-day day.",
                "Only slower-turning planets let the low reach the pole, and"
                " between the two widths the limit rises more slowly. No effect"
                " on the Earth.",
                "Planets with days between 1 and 4 Earth days let the low near"
                " the pole sooner. No effect on the Earth. Keep it above"
                " lowLimitFromWidthDeg.",
                "Our choice, after the slower of the paper's two spins, a quarter"
                " of the Earth's. Not tuned.",
            ),
            Setting(
                "lowLimitEaseShare",
                "0.5",
                "How gently the low is held short of its limit. It follows the"
                " hottest latitude in full up to a knee (60° today), then slows"
                " smoothly towards the limit.",
                "The knee comes nearer the equator: the low is held back from"
                " lower latitudes, but more gently. No effect on the Earth.",
                "The low follows the hottest latitude further, then stops more"
                " sharply; at 0 it stops dead at the limit. No effect on the"
                " Earth.",
                "A guess. Not tuned.",
            ),
        ],
    ),
    (
        "Steep tilts",
        [
            Setting(
                "minSummerCellShare",
                "0.3",
                "The narrowest the tropical cell may be on the summer side of the"
                " low, as a share of a cell's width, when the low lies far from"
                " the equator.",
                "That side stays wider, so pressure rises more gently from the low"
                " towards the summer pole. Matters mostly for a low far out, at a"
                " steep tilt; on the Earth only over hot land late in the northern"
                " summer, where the low lies furthest out.",
                "The side can be squeezed narrower, giving a steeper, ridge-like"
                " rise of pressure, and stronger winds there.",
                "A guess. Not tuned.",
            ),
            Setting(
                "wideSummerFromShare",
                "0.4",
                "How far out the low must lie, as a share of a cell's width,"
                " before a squeezed summer side starts to widen again towards a"
                " whole cell.",
                "The widening starts later, so a low far from the equator keeps a"
                " narrower summer side and a steeper rise of pressure.",
                "The widening starts sooner, keeping the rise gentler. On the"
                " Earth it already acts over hot land from July to September,"
                " where the low placed by longitude lies up to 0.79 of a cell"
                " out; its band as a whole lies at most 0.51 out, and is"
                " untouched.",
                "Set by hand against the Earth tilted 60°, before the bands"
                " varied by longitude.",
            ),
            Setting(
                "wideSummerToShare",
                "0.8",
                "How far out the low lies, as a share of a cell's width, when the"
                " summer side is a whole cell again.",
                "The widening is spread further, so for lows in between the"
                " summer side is narrower and the rise steeper.",
                "The side is a whole cell again sooner, and the rise gentler."
                " Keep it above wideSummerFromShare. On the Earth, it acts only"
                " over hot land from July to September.",
                "Set by hand against the Earth tilted 60°.",
            ),
            Setting(
                "sideContrastK",
                "30 K",
                "How much cooler a pole must be than the low for the bands on its"
                " side to be at full strength. On a side whose pole is nearly as"
                " warm as the low, the bands fade away.",
                "The bands weaken on any side whose pole is not much colder than"
                " the low. The Earth's poles are about 30 K or more cooler than"
                " its low, so its summer bands weaken too: already in January its"
                " southern side is at 98% strength.",
                "The bands stay strong even beside a pole only a little cooler"
                " than the low. At 20 K, the Earth tilted 60° had a high rising"
                " 15 hPa within 8° of its July low, over a warm Arctic.",
                "Started at 20 K. Set by hand against the Earth tilted 60°.",
            ),
        ],
    ),
    (
        "The bands far from the low",
        [
            Setting(
                "outerCellShare",
                "0.3",
                "The share of strength kept by the bands beyond the second cell"
                " from the low: the polar easterlies, which are weak on the real"
                " Earth.",
                "Stronger polar easterlies, and more pressure difference between"
                " the subpolar lows and the poles. At 1 every band is as strong"
                " as the first two.",
                "Weaker polar winds; at 0 the bands beyond the second are flat.",
                "Started at 1; moved for the Earth's polar winds.",
                tuned=True,
            ),
            Setting(
                "fullBandsReachDeg",
                "60°",
                "On a planet spinning faster than the Earth, how far from the low"
                " the bands keep full strength. At the Earth's spin and slower,"
                " only the first two cells are at full strength.",
                "Fast-spinning planets keep more of their extra bands at full"
                " strength. Above 60° it reaches past the Earth's second cell, so"
                " the Earth's polar easterlies strengthen too.",
                "No effect at the Earth's spin or slower. Fast-spinning planets"
                " keep fewer bands at full strength, down to the first two, as on"
                " the Earth.",
                "Our choice: two of the Earth's cell widths. Not tuned.",
            ),
            Setting(
                "poleTaperDeg",
                "10°",
                "The distance from each pole over which the bands ease out to"
                " nothing, so the pressure does not come to a point at the pole.",
                "The bands fade over a wider polar cap: weaker winds near the poles.",
                "The bands keep their strength closer to each pole, the polar"
                " winds reaching further poleward.",
                "Started at 15°. Moved by hand to keep more of the polar cell,"
                " not against the observed Earth.",
            ),
        ],
    ),
    (
        "Bands that follow land and sea",
        [
            Setting(
                "localBandsShare",
                "1",
                "How much of the low's place, in the tropics and subtropics, is"
                " taken from the temperature near each longitude rather than the"
                " whole latitude's: the bands over an ocean follow the ocean's"
                " seasons, those over a continent the continent's.",
                "Already at its full value. Above 1 it would overshoot the local"
                " placing, which it is not meant for.",
                "The bands become more nearly one pattern round the globe. At 0,"
                " the model before the bands varied by longitude, the far ocean's"
                " subtropical highs on the one-continent world move 18° and 23°"
                " between January and July, against 5° and 7° now, and the"
                " Earth's July south-west monsoon falls from (+4.5, +3.2) to"
                " (+2.0, +1.3) m/s.",
                "Our choice. Not tuned against the Earth.",
            ),
            Setting(
                "localWindowDeg",
                "180°",
                "The width in longitude of the window the temperature is averaged"
                " over to place the low at each longitude.",
                "The window takes in more of the globe, so the low follows a"
                " continent or an ocean less, and the bands come nearer one"
                " pattern round the globe.",
                "The low follows the land beneath it more closely. At 120° the"
                " open ocean's bands move as little and the Earth's July"
                " south-west monsoon is stronger, but the Earth tilted 60° loses"
                " its northern band of yearly winds.",
                "Our choice, after trying 120° and 180°. Not tuned against the Earth.",
            ),
            Setting(
                "localWindowTaperShare",
                "0.5",
                "How much of each half of the window fades out gradually towards"
                " its end, rather than counting in full.",
                "Softer edges, and the part counting in full shrinks: the low"
                " moves more gently as the window slides from sea onto land, and"
                " follows nearby land a little more.",
                "The window counts evenly almost to its ends, so the low changes"
                " more abruptly from one longitude to the next as a coast enters"
                " or leaves it. At 0 it is a plain box.",
                "Our choice. Not tuned against the Earth.",
            ),
            Setting(
                "localBandsFullToDeg",
                "40°",
                "The latitude up to which the bands follow the temperature near"
                " each longitude in full. Beyond it they blend into one pattern"
                " round the globe.",
                "Land and sea shape the bands further from the equator, and the"
                " blend is squeezed into a narrower belt. It must stay below"
                " localBandsGlobalFromDeg; the model refuses it otherwise.",
                "The blend starts nearer the equator and is spread wider, so"
                " every band from the new value to 70°, the subtropical highs"
                " among them, follows the land and sea beneath it less.",
                "Our choice. Not tuned against the Earth.",
            ),
            Setting(
                "localBandsGlobalFromDeg",
                "70°",
                "The latitude from which the bands are one pattern round the"
                " globe, as they must be towards a pole, where every longitude"
                " meets.",
                "Land and sea shape the bands further towards the poles, and the"
                " blend is spread over a wider belt.",
                "The bands are one pattern from nearer the equator, and the blend"
                " is squeezed. It must stay above localBandsFullToDeg.",
                "Our choice: past the subpolar lows, short of the fade at the"
                " poles. Not tuned against the Earth.",
            ),
        ],
    ),
    (
        "How strong the bands are",
        [
            Setting(
                "bandAmplitudeHpa",
                "9 hPa",
                "How strong the pressure bands are: the rise from the low to the"
                " subtropical highs, and so how fast the trade winds and"
                " westerlies blow.",
                "Higher subtropical highs, deeper subpolar lows, and faster"
                " trades and westerlies, in proportion. At 9 hPa they blow about"
                " 6.5 m/s over the sea in the first two cells.",
                "Weaker bands and slower winds, in proportion; the highs and lows"
                " over land and sea then count for more beside them.",
                "Started at 5 hPa; moved for the Earth's winds.",
                tuned=True,
            ),
        ],
    ),
    (
        "Highs and lows over land and sea",
        [
            Setting(
                "thermalHpaPerK",
                "3 hPa/K",
                "Pressure added for each kelvin a place is colder than its"
                " latitude's average, and taken away for each kelvin warmer: the"
                " winter highs over cold continents and summer lows over hot ones.",
                "Stronger winter highs, such as the Siberian high, deeper summer"
                " lows, and stronger monsoon winds out of and into the"
                " continents.",
                "Weaker highs and lows over land; the bands dominate. At 0.7, the"
                " physical starting figure, the Earth's Siberian high and South"
                " Asian summer low came out too weak.",
                "Physics suggests 0.7 hPa/K for a shallow cold layer.",
                tuned=True,
            ),
            Setting(
                "thermalSmoothingKm",
                "900 km",
                "How far those highs and lows over land and sea are spread out:"
                " about the size of the Siberian winter high.",
                "Broader, shallower highs and lows: their centres weaken, and the"
                " winds round them are gentler but reach over a wider area.",
                "Tighter, sharper highs and lows that follow each coast and patch"
                " of land more closely, with stronger winds close to them.",
                "Started at 750 km.",
                tuned=True,
            ),
            Setting(
                "seaThermalShare",
                "0.3",
                "The share of that response the sea gets, against land's. Air over"
                " a warm or cold sea does not pool into a shallow dome as it does"
                " over land.",
                "Seas warmer or colder than their latitude make more of their own"
                " highs and lows. Near 1, warm subtropical seas in winter carry"
                " lows where the Earth has its subtropical highs and trade winds.",
                "Pressure over the sea comes more from the bands alone; at 0 the"
                " sea's own warmth or cold makes no pressure.",
                "Was 1, the land's value; brought in for the Earth's Pacific"
                " trade winds.",
                tuned=True,
            ),
            Setting(
                "warmLimitK",
                "6 K",
                "Caps how deep a hot place's low gets: warmth above the latitude's"
                " average counts less and less beyond about this many kelvin, so"
                " a low is at most 18 hPa deep before smoothing.",
                "Hot places' lows deepen further. With no cap, the Earth's hot"
                " continental interiors give a deep summer low over Siberia and"
                " none to speak of over South Asia.",
                "Shallower summer lows over hot land, and weaker winds drawn into"
                " them. 4, 6 and 8 K were tried against the Earth's July.",
                "First tried at 5 K; no cap before.",
                tuned=True,
            ),
            Setting(
                "coldKneeK",
                "20 K",
                "Up to this many kelvin colder than its latitude, a cold place's"
                " high grows in full with the cold; beyond it, extra cold counts"
                " less and less.",
                "No effect on the Earth, whose coldest place is 17 K below its"
                " latitude. Very cold places on extreme worlds build higher"
                " highs. At coldLimitK or above, the cold is cut off here.",
                "No effect until below 17 K. Then the Earth's strongest winter"
                " highs, in the basins north of Tibet, start to be trimmed.",
                "A guess: a guard for extreme worlds. Not tuned.",
            ),
            Setting(
                "coldLimitK",
                "25 K",
                "The most cold a high counts, however cold the place. At 3 hPa/K"
                " it keeps a high on low land within 75 hPa of its latitude"
                " before smoothing: about the Earth's record of 1,084 hPa.",
                "No effect on the Earth. Very cold places on extreme worlds get"
                " higher highs.",
                "No effect on the Earth. Highs on extreme worlds level off sooner;"
                " at or below coldKneeK the cold is cut off at the knee. The"
                " Earth tilted 60°, 24.3 K at its coldest, is held back a little"
                " already.",
                "A guess: a guard for extreme worlds. Not tuned.",
            ),
            Setting(
                "thermalHeightM",
                "2,500 m",
                "Fades the land's response over high ground, by a factor of"
                " about 2.7 for every this many metres of height, so a cold"
                " plateau is not taken for a dome of cold air.",
                "High ground counts for more. In full, the Asian winter high sits"
                " on the Tibetan Plateau rather than Mongolia and Siberia, with"
                " winds of 15 to 20 m/s down into India.",
                "High ground counts for less. At 1,500 m too much of the"
                " Siberian high on the Mongolian plateau was lost.",
                "First tried at 1,500 m; no fade before.",
                tuned=True,
            ),
        ],
    ),
    (
        "The wind from the pressure",
        [
            Setting(
                "seaFrictionPerS",
                "2.5e-5 /s",
                "Friction on the wind over the sea. It sets how far the wind cuts"
                " across the lines of equal pressure towards the low, and slows"
                " it. Land's friction is a multiple of it.",
                "The wind crosses the pressure lines more steeply towards the low"
                " and blows more slowly, most of all over land. At 3.7e-5 /s it"
                " crosses at about 20° in mid-latitudes.",
                "The wind follows the pressure lines more closely and blows"
                " faster. Today it crosses at about 14° in mid-latitudes and 34°"
                " at 15° from the equator.",
                "Started at 3.7e-5 /s, from the observed crossing angle.",
                tuned=True,
            ),
            Setting(
                "landFrictionFactor",
                "5",
                "How many times the sea's friction the land's is: how much land"
                " slows the wind.",
                "Slower winds over land, crossing the pressure lines more"
                " steeply. At 5 the Earth's land winds average near the observed"
                " 1.8 m/s, but cross at about 50°, more than observed.",
                "Faster winds over land, following the pressure lines more"
                " closely: at 2, with the sea's starting friction, they crossed"
                " at about 35°.",
                "Started at 2; moved for the Earth's winds over land.",
                tuned=True,
            ),
            Setting(
                "blockingSlope",
                "0.005",
                "The slope (1 km in 200 km) at which high ground takes away half"
                " of the wind's part up or down it, so the wind slows and turns"
                " along the slope.",
                "Mountains block less: steeper ground is needed to slow the wind"
                " across it, so more of it blows straight over ranges.",
                "Even gentle slopes slow the wind across them and turn it along"
                " ranges and high coasts.",
                "A guess. Not tuned.",
            ),
        ],
    ),
]

# The temperature model's last group is numerical, not physical: the intro
# counts it apart.
SOLVER_GROUP = "The solver (numerical, not physical)"

TEMPERATURE: list[Group] = [
    (
        "How heat moves and is stored",
        [
            Setting(
                "diffusivity",
                "0.55 W/m²/K",
                "How readily heat spreads between neighbouring places over the"
                " sea. It stands in for all the heat the winds and currents"
                " carry, which the model does not yet work out.",
                "Heat spreads further: the poles warm and the tropics cool, so"
                " the equator-to-pole difference shrinks, with less polar ice and"
                " milder coasts.",
                "Each place keeps more of its own heat: hotter tropics, colder"
                " poles, more ice, and sharper differences between neighbours.",
                "Published (North, Cahalan and Coakley, 1981), set a little"
                " below. Not tuned.",
            ),
            Setting(
                "landDiffusivity",
                "0.35 W/m²/K",
                "The same over land. An edge between land and sea takes the mean"
                " of the two.",
                "The sea's heat reaches further inland: milder continental"
                " interiors with smaller seasons. At the sea's value the"
                " interiors' seasonal range was about halved.",
                "Continents keep more of their own seasons: hotter summers and"
                " colder winters inland.",
                "Started at the sea's value.",
                tuned=True,
            ),
            Setting(
                "oceanHeatCapacity",
                "2.5e8 J/m²/K",
                "The heat the sea stores for each kelvin it warms: a mixed top"
                " layer of 60 m of water.",
                "The sea warms and cools more slowly: smaller, later seasons over"
                " the sea and on nearby coasts.",
                "The sea follows the sun more closely: larger seasons over the"
                " sea and coasts, peaking sooner after midsummer.",
                "A physical figure: 60 m of sea water. Not tuned.",
            ),
            Setting(
                "landHeatCapacity",
                "1e7 J/m²/K",
                "The heat land stores for each kelvin it warms: about that of the"
                " column of air above it alone.",
                "Land warms and cools more slowly: smaller, later seasons inland,"
                " more like the sea's.",
                "Land follows the sun even more closely: larger seasons, peaking"
                " nearer midsummer.",
                "As simple seasonal models take it. Not tuned.",
            ),
            Setting(
                "seaIceHeatCapacity",
                "1e7 J/m²/K",
                "The heat stored by sea wholly covered in ice. Ice cuts the air"
                " off from the water below, so frozen sea warms and cools like"
                " land; partly frozen sea takes a blend with open sea.",
                "Frozen seas cool more slowly in winter: milder polar winters. At"
                " the open sea's value the Arctic winter was 10 K too warm.",
                "Frozen seas swing faster: colder polar winters.",
                "Taken equal to land's. Not tuned.",
            ),
            Setting(
                "lapseRate",
                "6.5 K/km",
                "How fast the air cools with height above sea level. The winds"
                " read the temperature brought back to sea level at the same"
                " rate.",
                "Mountains and plateaux are colder, with more snow and ice on"
                " high ground.",
                "High ground is warmer, with less snow and ice on it.",
                "The standard atmosphere. Not tuned.",
            ),
            Setting(
                "greenhouseFactor",
                "0.633",
                "How strongly the Planet section's greenhouse strength (the"
                " Earth's is 1) holds back the planet's outgoing heat: the heat"
                " is divided by 1 + this × the strength, so the Earth keeps back"
                " about 39% of it. It does nothing on a planet whose greenhouse"
                " strength is 0.",
                "Warmer everywhere, with less ice.",
                "Colder everywhere, with more ice; at 0 the greenhouse strength"
                " stops having any effect.",
                "The Earth's energy budget: it lets the Earth radiate as it is"
                " measured to. Not tuned.",
            ),
        ],
    ),
    (
        "Reflected sunlight",
        [
            Setting(
                "albedo",
                "0.27",
                "The share of sunlight reflected, on average over the globe, by"
                " ground clear of ice and snow.",
                "Colder everywhere; the colder poles grow more ice, which cools"
                " them further. Raised far enough, the planet can freeze over.",
                "Warmer everywhere, with less ice.",
                "Set to the observed global mean.",
                tuned=True,
            ),
            Setting(
                "albedoPoleward",
                "0.078",
                "How much more clear ground reflects towards the poles than near"
                " the equator. It averages to nothing over the globe.",
                "Colder poles and warmer tropics: a larger equator-to-pole"
                " difference and more polar ice. Mixed for the globe's average:"
                " the sunnier tropics gain, the extra ice cools.",
                "Milder poles and cooler tropics: a smaller equator-to-pole"
                " difference. Below 0 the tropics would reflect more than the"
                " poles.",
                "A published form (North, Cahalan and Coakley, 1981), tuned.",
                tuned=True,
            ),
            Setting(
                "landAlbedoExtra",
                "0",
                "Extra reflection from land clear of ice, on top of the sea's.",
                "Inert at today's 0. Raised, land reflects more: cooler"
                " continents, most of all where they are sunniest.",
                "Below 0, land is darker than sea: warmer continents.",
                "No starting point; left at 0 for later tuning.",
            ),
            Setting(
                "iceAlbedo",
                "0.62",
                "The share of sunlight reflected by ground wholly covered in ice"
                " or snow.",
                "Icy places are colder and the ice spreads further, as the cold"
                " makes more ice: a stronger feedback, so a planet near freezing"
                " freezes over more easily.",
                "Ice cools its surroundings less and spreads less: milder poles"
                " and winters.",
                "A published form (North, Cahalan and Coakley, 1981), tuned.",
                tuned=True,
            ),
            Setting(
                "iceStartC",
                "0 °C",
                "The air temperature below which ice and snow start to come in.",
                "Ice starts in milder places: more ice and snow, and so colder.",
                "Ice starts only in colder places: less ice, and milder high"
                " latitudes. It must stay above iceFullC; the model refuses it"
                " otherwise.",
                "A smooth ramp rather than a single freezing point. Not tuned.",
            ),
            Setting(
                "iceFullC",
                "-10 °C",
                "The air temperature at and below which a place is wholly covered"
                " in ice or snow.",
                "Places are wholly icy at milder temperatures: more ice, and so"
                " colder, with a sharper switch from clear to icy. It must stay"
                " below iceStartC; the model refuses it otherwise.",
                "A wider, gentler ramp: less ice at a given temperature.",
                "A smooth ramp rather than a single freezing point. Not tuned.",
            ),
        ],
    ),
    (
        SOLVER_GROUP,
        [
            Setting(
                "stepsPerMonth",
                "2",
                "How many time steps each month is solved in.",
                "More exact, and slower in proportion; 48 at most. Two steps"
                " differ from 24 by at most 0.4 K in any month's root-mean-square"
                " and 0.07 K in the yearly average, in half the time of four.",
                "1 is the least: faster, and less exact.",
                "Chosen by measurement on the Earth.",
            ),
            Setting(
                "solverToleranceK",
                "0.005 K",
                "How closely each step's balance of heat is solved.",
                "Faster, less exact temperatures.",
                "Slower, more exact temperatures. Set too low for a step to"
                " reach, no year counts as settled: the solve runs its full"
                " limit of years (60 unless set) and is marked as not settled.",
                "Chosen by measurement on the Earth.",
            ),
            Setting(
                "solverMaxIterations",
                "200",
                "The most rounds one solve of a step may take before it gives"
                " up. It normally needs 5 to 25.",
                "No effect unless a solve is struggling, which then has longer to"
                " finish. 10,000 at most.",
                "No effect until near 25. Below that, steps stop short and no"
                " year counts as settled: the solve runs its full limit of years"
                " (60 unless set) and is marked as not settled.",
                "A safety limit, shared with the heat exchange solver. Not tuned.",
            ),
            Setting(
                "terrainDriftLimitK",
                "0.25 K",
                "After terrain edits, the temperature carries on from the last"
                " result until the terrain has changed by this much, measured as"
                " cooling with height (about 40 m over the whole surface); then"
                " it starts afresh.",
                "It starts afresh less often, so edits update sooner; but a world"
                " at a freezing tipping point can stay in the wrong climate"
                " longer.",
                "It starts afresh more often: slower, but a wrong climate lasts"
                " less long. At 0 it always starts afresh.",
                "Chosen, not derived, from measurements on the Earth, a generated"
                " world and worlds near freezing.",
            ),
            Setting(
                "correctionRefineK",
                "1 K",
                "Each year's solve ends with a correction towards the settled"
                " climate. One smaller than this skips its later, finer passes.",
                "Mixed. A small rise skips those passes more often: a little"
                " faster, a little less exact. A large one lets big corrections"
                " skip them too, and those overshoot, by thousands of kelvin"
                " after a big change of planet.",
                "More passes are solved: slower. At 0 every pass is. Below 1 K"
                " the skipped passes move no month on the Earth by more than"
                " 0.001 K.",
                "Chosen by measurement on the Earth.",
            ),
        ],
    ),
]

# Setting, value, what it controls, raising it, lowering it, where it comes
# from: 781 points, just within the page's width less its margins (781.89).
COLS = [114, 54, 170, 165, 165, 113]
HEADINGS = (
    "Setting",
    "Value",
    "What it controls",
    "Raising it",
    "Lowering it",
    "Where it comes from",
)


def source_cell(setting: Setting) -> list[Paragraph]:
    """Where a setting comes from, with the orange mark if tuned to the Earth."""
    cell = [Paragraph(setting.source, CELL)]
    if setting.tuned:
        cell.append(Paragraph(EARTH, TUNED))
    return cell


def settings_table(groups: list[Group]) -> Table:
    rows: list[list[object]] = [[Paragraph(h, HEADER) for h in HEADINGS]]
    style: list[tuple[object, ...]] = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.9, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 2.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    for group, settings in groups:
        rows.append([Paragraph(group, GROUP), "", "", "", "", ""])
        index = len(rows) - 1
        style.append(("SPAN", (0, index), (-1, index)))
        style.append(("BACKGROUND", (0, index), (-1, index), LOOP_FILL))
        # Keep a group's heading on the same page as its first setting.
        style.append(("NOSPLIT", (0, index), (-1, index + 1)))
        for setting in settings:
            rows.append(
                [
                    Paragraph(setting.name, NAME),
                    Paragraph(setting.value, CELL),
                    Paragraph(setting.controls, CELL),
                    Paragraph(setting.raising, CELL),
                    Paragraph(setting.lowering, CELL),
                    source_cell(setting),
                ],
            )
            row = len(rows) - 1
            style.append(("LINEBELOW", (0, row), (-1, row), 0.25, SIDE_EDGE))
    table = Table(rows, colWidths=COLS, repeatRows=1)
    table.setStyle(TableStyle(style))
    return table


def settings_pages(title: str, intro: list[str], groups: list[Group]) -> None:
    """Draws a model's settings table over as many pages as it needs."""
    table: Table | None = settings_table(groups)
    first = True
    while table is not None:
        top = 560
        label(40, top, title if first else f"{title} (continued)", INK, 14, bold=True)
        below = top - 12
        if first:
            for line in intro:
                below -= 12
                label(40, below + 9, line, MUTED, 9)
            below -= 6
        available = below - 28
        parts = table.split(W - 60, available)
        part = parts[0]
        _, height = part.wrapOn(c, W - 60, available)
        part.drawOn(c, 30, below - height)
        table = parts[1] if len(parts) > 1 else None
        first = False
        c.showPage()


def count(groups: list[Group]) -> int:
    return sum(len(settings) for _, settings in groups)


def count_tuned(groups: list[Group]) -> int:
    return sum(setting.tuned for _, settings in groups for setting in settings)


HOW_TO_READ = (
    "The columns Raising it and Lowering it say what moving a setting away from"
    " the value shown does, everything else left as it is. K is a kelvin, a step"
    " of 1 °C."
)

wind_intro = (
    f"The {count(WIND)} settings the wind model is built on, as of {DRAWN}."
    f" In orange: the {count_tuned(WIND)} tuned by hand against the observed"
    " Earth."
)
settings_pages("The wind model's settings", [wind_intro, HOW_TO_READ], WIND)

solver = count([group for group in TEMPERATURE if group[0] == SOLVER_GROUP])
temperature_intro = (
    f"The {count(TEMPERATURE)} settings the temperature model is built on,"
    f" as of {DRAWN}: {count(TEMPERATURE) - solver} physical and {solver} for"
    f" the solver. In orange: the {count_tuned(TEMPERATURE)} tuned against the"
    " observed Earth."
)
settings_pages(
    "The temperature model's settings",
    [temperature_intro, HOW_TO_READ],
    TEMPERATURE,
)
c.save()
