import math

import cadquery as cq
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepLProp import BRepLProp_SLProps
from OCP.BRepTools import BRepTools
from OCP.TopAbs import TopAbs_REVERSED

# A true hole is a concave cylindrical surface that wraps most of the way around
# its axis. This threshold (3/4 turn) separates bores from fillets, rounded
# corners, and bosses, which sweep far less.
HOLE_MIN_SWEEP = math.radians(270)


def _canonical_axis_dir(dx: float, dy: float, dz: float) -> tuple:
    """Give an axis direction a consistent sign so coaxial faces share a key."""
    for c in (dx, dy, dz):
        if abs(c) > 1e-6:
            sign = 1 if c > 0 else -1
            return (dx * sign, dy * sign, dz * sign)
    return (dx, dy, dz)


def _detect_holes(faces) -> int:
    """Count true holes in the part.

    A cylindrical face belongs to a hole when its outward normal points toward
    its own axis (concave: material wraps around an empty bore) rather than away
    (convex: a boss or external round). Coaxial concave faces are grouped so a
    bore split into several faces counts once, and a group only counts if its
    faces together wrap most of the way around the axis, which excludes concave
    fillets and inside corners.
    """
    groups: dict = {}
    for f in faces:
        if f.geomType() != "CYLINDER":
            continue
        try:
            surf = BRepAdaptor_Surface(f.wrapped)
            cyl = surf.Cylinder()
            axis = cyl.Axis()
            loc = axis.Location()
            d = axis.Direction()

            umin, umax, vmin, vmax = BRepTools.UVBounds_s(f.wrapped)
            sweep = umax - umin

            props = BRepLProp_SLProps(
                surf, (umin + umax) / 2, (vmin + vmax) / 2, 1, 1e-6
            )
            if not props.IsNormalDefined():
                continue
            p = props.Value()
            n = props.Normal()
            nx, ny, nz = n.X(), n.Y(), n.Z()
            if f.wrapped.Orientation() == TopAbs_REVERSED:
                nx, ny, nz = -nx, -ny, -nz

            # radial direction from the axis out to the sample point
            vx, vy, vz = p.X() - loc.X(), p.Y() - loc.Y(), p.Z() - loc.Z()
            along = vx * d.X() + vy * d.Y() + vz * d.Z()
            rx, ry, rz = vx - along * d.X(), vy - along * d.Y(), vz - along * d.Z()
            rlen = (rx * rx + ry * ry + rz * rz) ** 0.5
            if rlen < 1e-9:
                continue

            # concave (hole) when the outward normal opposes the radial direction
            if (nx * rx + ny * ry + nz * rz) / rlen >= 0:
                continue

            # key coaxial faces by axis line + radius so one bore counts once
            cd = _canonical_axis_dir(d.X(), d.Y(), d.Z())
            offset = loc.X() * cd[0] + loc.Y() * cd[1] + loc.Z() * cd[2]
            px, py, pz = (
                loc.X() - offset * cd[0],
                loc.Y() - offset * cd[1],
                loc.Z() - offset * cd[2],
            )
            key = (
                round(cd[0], 2), round(cd[1], 2), round(cd[2], 2),
                round(px, 1), round(py, 1), round(pz, 1),
                round(cyl.Radius(), 1),
            )
            groups[key] = groups.get(key, 0.0) + sweep
        except Exception:
            continue

    return sum(1 for total in groups.values() if total >= HOLE_MIN_SWEEP)


def analyze(filepath: str) -> dict:
    shape = cq.importers.importStep(filepath)
    solid = shape.val()
    bb = solid.BoundingBox()

    volume_cm3 = solid.Volume() / 1000
    surface_area_cm2 = solid.Area() / 100

    # bounding box surface area in cm²
    bbox_sa_cm2 = 2 * (
        (bb.xlen / 10) * (bb.ylen / 10) +
        (bb.ylen / 10) * (bb.zlen / 10) +
        (bb.xlen / 10) * (bb.zlen / 10)
    )

    faces = shape.faces().vals()
    edges = shape.edges().vals()

    detected_holes = _detect_holes(faces)

    # detect unique axes cylindrical faces point along — proxy for setup count on 3-axis Haas
    cyl_axes = set()
    for f in faces:
        if f.geomType() == "CYLINDER":
            n = f.normalAt()
            components = [abs(n.x), abs(n.y), abs(n.z)]
            dominant = components.index(max(components))
            cyl_axes.add(dominant)
    cylinder_axis_count = len(cyl_axes)

    return {
        "bounding_box_mm": {
            "length": round(bb.xlen, 2),
            "width": round(bb.ylen, 2),
            "height": round(bb.zlen, 2),
        },
        "volume_cm3": round(volume_cm3, 2),
        "surface_area_cm2": round(surface_area_cm2, 2),
        "bbox_surface_area_cm2": round(bbox_sa_cm2, 2),
        "features": {
            "face_count": len(faces),
            "edge_count": len(edges),
            "holes_detected": detected_holes,
            "estimated_setups": max(1, cylinder_axis_count),
            "complexity_score": 0.0,
        },
    }
