from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    length: float
    width: float
    height: float


class Geometry(BaseModel):
    bounding_box_mm: BoundingBox
    stock_dimensions_mm: BoundingBox
    volume_cm3: float
    surface_area_cm2: float


class Features(BaseModel):
    face_count: int
    edge_count: int
    holes_detected: int
    estimated_setups: int
    complexity_score: float


class CostBreakdown(BaseModel):
    material_cost_per_unit: float
    machine_time_cost_per_unit: float
    setup_cost_per_unit: float
    total_cost_per_unit: float
    total_order_cost: float


class QuoteDocument(BaseModel):
    file_name: str
    quantity: int
    material: str = "6061 Aluminum"
    geometry: Geometry
    features: Features
    cost_breakdown: CostBreakdown
    lead_time_days: int
    status: Literal["new", "quoted", "reviewed", "archived"] = "quoted"
    created_at: datetime = Field(default_factory=datetime.utcnow)
