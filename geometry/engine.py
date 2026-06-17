import cadquery as cq


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

    # cylindrical face count — proxy for holes/bosses (see known limitations)
    detected_holes = sum(1 for f in faces if f.geomType() == "CYLINDER")

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
