import os
import tempfile

from bson import ObjectId
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from geometry.engine import analyze
from backend.models import BoundingBox, CostBreakdown, Features, Geometry, QuoteDocument
from backend.database import db

router = APIRouter(prefix="/quotes", tags=["quotes"])


def _stub_pricing(geometry: dict, quantity: int) -> tuple[CostBreakdown, int]:
    # TODO: replace with real pricing formula
    return CostBreakdown(
        material_cost_per_unit=0.0,
        machine_time_cost_per_unit=0.0,
        setup_cost_per_unit=0.0,
        total_cost_per_unit=0.0,
        total_order_cost=0.0,
    ), 5


@router.post("")
async def create_quote(file: UploadFile = File(...), quantity: int = Form(...)):
    if not file.filename.lower().endswith((".step", ".stp")):
        raise HTTPException(status_code=400, detail="File must be a .step or .stp file")

    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        raw = analyze(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse STEP file: {e}")
    finally:
        os.unlink(tmp_path)

    geometry = Geometry(
        bounding_box_mm=BoundingBox(**raw["bounding_box_mm"]),
        volume_cm3=raw["volume_cm3"],
        surface_area_cm2=raw["surface_area_cm2"],
    )
    features = Features(**raw["features"])
    cost_breakdown, lead_time_days = _stub_pricing(raw, quantity)

    doc = QuoteDocument(
        file_name=file.filename,
        quantity=quantity,
        geometry=geometry,
        features=features,
        cost_breakdown=cost_breakdown,
        lead_time_days=lead_time_days,
    )

    result = await db.quotes.insert_one(doc.model_dump())
    return {**doc.model_dump(), "id": str(result.inserted_id)}


@router.get("")
async def list_quotes():
    quotes = await db.quotes.find().sort("created_at", -1).to_list(100)
    for q in quotes:
        q["id"] = str(q.pop("_id"))
    return quotes


@router.get("/{quote_id}")
async def get_quote(quote_id: str):
    quote = await db.quotes.find_one({"_id": ObjectId(quote_id)})
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    quote["id"] = str(quote.pop("_id"))
    return quote


@router.patch("/{quote_id}/status")
async def update_status(quote_id: str, status: str):
    valid = {"new", "quoted", "reviewed", "archived"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {valid}")
    result = await db.quotes.update_one(
        {"_id": ObjectId(quote_id)}, {"$set": {"status": status}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"id": quote_id, "status": status}
