import re

import cadquery as cq
from cadquery.occ_impl.exporters.svg import getSVG

# Fixed isometric projection — angle-robust so features stay visible regardless
# of how the part is oriented in the STEP file. Hidden lines kept on for full
# detail; bright strokes for contrast against the dark UI.
SVG_OPTS = {
    "width": 420,
    "height": 420,
    "marginLeft": 20,
    "marginTop": 20,
    "showAxes": False,
    "projectionDir": (1, -1, 0.65),
    "strokeWidth": -1,                 # -1 = auto scale to part
    "strokeColor": (235, 235, 240),    # visible edges: near white
    "hiddenColor": (120, 130, 150),    # hidden edges: muted slate
    "showHidden": True,
}

# Keep strokes a constant width on screen regardless of render size, so the same
# SVG stays crisp from a 40px thumbnail up to the full result preview.
_STYLE = "<style>path{vector-effect:non-scaling-stroke;stroke-width:1.1px}</style>"


def render_svg(filepath: str) -> str:
    """Render a STEP file to an isometric SVG line drawing (blueprint style).

    cadquery's raw SVG has no viewBox and leaves the part offset in a corner of
    the canvas. We post-process it to crop tightly around the geometry (centering
    it) and to make strokes scale-independent. Background stays transparent.
    """
    shape = cq.importers.importStep(filepath)
    svg = getSVG(shape.val(), SVG_OPTS)
    # cadquery dashes hidden lines with very small stroke-dasharray values. Some
    # SVG engines (notably the VSCode Simple Browser) mis-render those tiny
    # dashes into page-wide streaks, so we drop the dasharray and let hidden
    # lines render solid. They stay distinct from visible edges by color.
    svg = re.sub(r'\s*stroke-dasharray="[^"]*"', "", svg)
    return _fit_to_content(svg)


def _fit_to_content(svg: str) -> str:
    """Add a tight viewBox + non-scaling strokes to cadquery's SVG output."""
    transform = re.search(
        r"scale\(([-\d.]+),\s*([-\d.]+)\)\s*translate\(([-\d.]+),\s*([-\d.]+)\)", svg
    )
    points = re.findall(r"[ML](-?\d[\d.]*),(-?\d[\d.]*)", svg)
    if not transform or not points:
        return svg

    sx, sy, tx, ty = map(float, transform.groups())
    # Map every path point through the content transform into canvas space.
    xs = [sx * (float(x) + tx) for x, _ in points]
    ys = [sy * (float(y) + ty) for _, y in points]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)

    w, h = max_x - min_x, max_y - min_y
    pad = 0.07 * max(w, h)
    view_box = f"{min_x - pad:.2f} {min_y - pad:.2f} {w + 2 * pad:.2f} {h + 2 * pad:.2f}"

    svg = svg.replace(
        "<svg",
        f'<svg viewBox="{view_box}" preserveAspectRatio="xMidYMid meet"',
        1,
    )
    close = svg.find(">", svg.find("<svg"))
    return svg[: close + 1] + _STYLE + svg[close + 1 :]
