import cadquery as cq


def analyze(filepath: str) -> dict:
    shape = cq.importers.importStep(filepath)
    solid = shape.val()
    bb = solid.BoundingBox()

    volume_cm3 = solid.Volume() / 1000
    surface_area_cm2 = solid.Area() / 100

    faces = shape.faces().vals()
    edges = shape.edges().vals()
    #right now only tracks cylinder faces. this is where we'd put our hole detection implementation
    detected_holes = sum(1 for f in faces if f.geomType() == "CYLINDER")

    sa_to_vol = surface_area_cm2 / volume_cm3
    complexity = round(1.0 + (len(faces) / 100) + (sa_to_vol / 100), 2)

    return {
        "bounding_box_mm": {
            "length": round(bb.xlen, 2),
            "width": round(bb.ylen, 2),
            "height": round(bb.zlen, 2),
        },
        "volume_cm3": round(volume_cm3, 2),
        "surface_area_cm2": round(surface_area_cm2, 2),
        "features": {
            "face_count": len(faces),
            "edge_count": len(edges),
            "holes_detected": detected_holes,
            "complexity_score": complexity,
        },
    }
