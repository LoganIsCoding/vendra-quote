import os

from geometry.engine import analyze

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def test_gear_geometry():
    result = analyze(os.path.join(FIXTURES, "gear.step"))

    assert result["bounding_box_mm"] == {"length": 22.56, "width": 23.37, "height": 12.32}
    assert result["volume_cm3"] == 1.95
    assert result["surface_area_cm2"] == 14.21
    assert result["features"]["face_count"] == 99
    assert result["features"]["edge_count"] == 284
    assert result["features"]["holes_detected"] == 1
    assert result["features"]["estimated_setups"] == 2


def test_bracket_geometry():
    result = analyze(os.path.join(FIXTURES, "bracket.step"))

    assert result["bounding_box_mm"] == {"length": 90.0, "width": 90.0, "height": 41.0}
    assert result["volume_cm3"] == 40.96
    assert result["surface_area_cm2"] == 166.85
    assert result["features"]["face_count"] == 17
    assert result["features"]["edge_count"] == 45
    assert result["features"]["holes_detected"] == 4
    assert result["features"]["estimated_setups"] == 2


def test_standalone_complexity_score_is_zero():
    # complexity is a pricing-layer concept, not computed in the geometry engine
    result = analyze(os.path.join(FIXTURES, "gear.step"))
    assert result["features"]["complexity_score"] == 0.0
