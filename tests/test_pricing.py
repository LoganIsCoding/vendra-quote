import pytest

from backend import pricing

BRACKET_GEOMETRY = {
    "bounding_box_mm": {"length": 90.0, "width": 90.0, "height": 41.0},
    "volume_cm3": 40.96,
    "surface_area_cm2": 166.85,
    "bbox_surface_area_cm2": 309.6,
}
BRACKET_FEATURES = {
    "face_count": 17,
    "edge_count": 45,
    "holes_detected": 4,
    "estimated_setups": 2,
}


def test_snap_thickness_rounds_up_to_nearest_standard_plate():
    # bracket height is 41mm (1.614in), should snap up to 2.0in, not down to 1.5in
    assert pricing.snap_thickness(41.0) == pytest.approx(50.8)


def test_snap_thickness_exact_match_does_not_round_up():
    assert pricing.snap_thickness(25.4) == pytest.approx(25.4)  # exactly 1.0in


def test_snap_thickness_caps_at_largest_standard_plate():
    largest_in = pricing.STANDARD_THICKNESSES_IN[-1]
    assert pricing.snap_thickness(500.0) == pytest.approx(largest_in * 25.4)


@pytest.mark.parametrize(
    "quantity,expected_discount",
    [(1, 0.0), (5, 0.0), (6, 0.10), (20, 0.10), (21, 0.20), (100, 0.30), (250, 0.30)],
)
def test_quantity_discount_tiers(quantity, expected_discount):
    assert pricing.quantity_discount(quantity) == expected_discount


def test_complexity_score_has_a_floor_of_one():
    score = pricing.complexity_score(BRACKET_GEOMETRY, BRACKET_FEATURES)
    assert score >= 1.0


def test_complexity_score_is_capped_at_four():
    extreme_geometry = {
        "bounding_box_mm": {"length": 1.0, "width": 1.0, "height": 1.0},
        "volume_cm3": 0.01,
        "surface_area_cm2": 1000.0,
        "bbox_surface_area_cm2": 1.0,
    }
    extreme_features = {"face_count": 10, "edge_count": 10, "holes_detected": 10, "estimated_setups": 3}
    score = pricing.complexity_score(extreme_geometry, extreme_features)
    assert score == 4.0


def test_calculate_quantity_discount_lowers_machine_cost_but_not_material_cost():
    cost_1, _, _, _ = pricing.calculate(BRACKET_GEOMETRY, BRACKET_FEATURES, quantity=1)
    cost_100, _, _, _ = pricing.calculate(BRACKET_GEOMETRY, BRACKET_FEATURES, quantity=100)

    # material cost is per-unit raw material, unaffected by the order's quantity discount
    assert cost_1["material_cost_per_unit"] == pytest.approx(cost_100["material_cost_per_unit"])
    # machine time cost drops at quantity 100 thanks to the 30% discount tier
    assert cost_100["machine_time_cost_per_unit"] < cost_1["machine_time_cost_per_unit"]


def test_setup_cost_is_counted_once_across_the_order():
    cost_1, _, _, _ = pricing.calculate(BRACKET_GEOMETRY, BRACKET_FEATURES, quantity=1)
    cost_10, _, _, _ = pricing.calculate(BRACKET_GEOMETRY, BRACKET_FEATURES, quantity=10)

    setup_total_at_1 = cost_1["setup_cost_per_unit"] * 1
    setup_total_at_10 = cost_10["setup_cost_per_unit"] * 10
    assert setup_total_at_1 == pytest.approx(setup_total_at_10, rel=0.01)
