ALUMINUM_DENSITY = 2.7        # g/cm³
MATERIAL_PRICE = 5.00         # $/kg
MACHINE_RATE = 100.0          # $/hr
SETUP_HOURS_PER_SETUP = 0.75  # hrs per fixturing orientation; ~1.5hr for a typical 2-setup part (PDF example: $15/unit at qty 10)
MRR = 150.0                   # cm³/min, material removal rate (roughing) on Haas for 6061 aluminum
FINISH_RATE = 0.0014          # hr per cm² of surface area, finishing pass time (calibrated to PDF example)

# Standard aluminum stock thicknesses in inches
STANDARD_THICKNESSES_IN = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0]

QUANTITY_DISCOUNTS = [
    (100, 0.30),
    (21,  0.20),
    (6,   0.10),
    (1,   0.00),
]


def snap_thickness(height_mm: float) -> float:
    height_in = height_mm / 25.4
    for std in STANDARD_THICKNESSES_IN:
        if height_in <= std:
            return std * 25.4
    return STANDARD_THICKNESSES_IN[-1] * 25.4


def quantity_discount(quantity: int) -> float:
    for min_qty, discount in QUANTITY_DISCOUNTS:
        if quantity >= min_qty:
            return discount
    return 0.0


def complexity_score(geometry: dict, features: dict) -> float:
    # cyl_ratio: drilling-operation density (true holes per face)
    # sa_to_vol: fine-detail penalty, small intricate parts cost more per unit area
    # accessibility: part surface vs bounding-box surface, a proxy for hard-to-reach features
    cyl_ratio      = features["holes_detected"] / max(features["face_count"], 1)
    sa_to_vol      = geometry["surface_area_cm2"] / max(geometry["volume_cm3"], 0.001)
    accessibility  = geometry["surface_area_cm2"] / max(geometry["bbox_surface_area_cm2"], 0.001)

    # Material removal is priced into roughing time, and orientation count into
    # setup cost, so neither is charged again here.
    score = (1.0
        + (cyl_ratio * 0.5)
        + (sa_to_vol / 20)
        + (accessibility * 0.2))

    return round(min(score, 4.0), 2)


def calculate(geometry: dict, features: dict, quantity: int) -> tuple[dict, int, float, dict]:
    bb = geometry["bounding_box_mm"]
    length_cm = bb["length"] / 10
    width_cm  = bb["width"]  / 10
    snapped_height_mm = snap_thickness(bb["height"])
    height_cm = snapped_height_mm / 10

    stock_volume_cm3 = length_cm * width_cm * height_cm
    part_volume_cm3  = geometry["volume_cm3"]
    material_removed = stock_volume_cm3 - part_volume_cm3

    complexity = complexity_score(geometry, features)

    # Material cost — based on stock volume (what the shop actually purchases)
    material_cost = stock_volume_cm3 * ALUMINUM_DENSITY / 1000 * MATERIAL_PRICE

    # Cutting time: roughing (bulk removal) plus finishing (surface passes)
    roughing_hours  = (material_removed / MRR) / 60
    finishing_hours = geometry["surface_area_cm2"] * FINISH_RATE
    cutting_hours   = roughing_hours + finishing_hours
    discount = quantity_discount(quantity)
    machine_time_cost = cutting_hours * complexity * MACHINE_RATE * (1 - discount)

    # Setup cost: per-orientation fixturing labor, amortized across quantity
    setup_cost = SETUP_HOURS_PER_SETUP * features["estimated_setups"] * MACHINE_RATE / quantity

    total_per_unit = material_cost + machine_time_cost + setup_cost
    total_order    = total_per_unit * quantity

    # Lead time: 5 day minimum + production days + complexity buffer
    production_days   = max(1, round(cutting_hours * quantity / 8))
    complexity_buffer = round((complexity - 1.0) * 2)
    lead_time_days    = 5 + production_days + complexity_buffer

    cost_breakdown = {
        "material_cost_per_unit":     round(material_cost, 2),
        "machine_time_cost_per_unit": round(machine_time_cost, 2),
        "setup_cost_per_unit":        round(setup_cost, 2),
        "total_cost_per_unit":        round(total_per_unit, 2),
        "total_order_cost":           round(total_order, 2),
    }

    stock_dimensions_mm = {
        "length": round(bb["length"], 2),
        "width": round(bb["width"], 2),
        "height": round(snapped_height_mm, 2),
    }

    return cost_breakdown, lead_time_days, complexity, stock_dimensions_mm
