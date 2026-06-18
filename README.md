# vendra-quote

CNC machining quote engine. Upload a `.STEP` file and a quantity, get an instant quote with a geometry breakdown, cost breakdown, and lead time. Every quote is saved to a global quote history.

## Stack

- **Geometry:** Python + cadquery (pythonOCC / OpenCASCADE)
- **Backend:** FastAPI + Motor (async MongoDB driver)
- **Database:** MongoDB via Docker Compose
- **Frontend:** Next.js + TypeScript + Tailwind

The geometry engine is Python, so the backend imports it directly with no subprocess or sidecar. It also runs standalone (see below), so the geometry analysis works independently of the website.

## Setup

### 1. Database

```bash
docker compose up -d
```

Starts MongoDB 7 on port 27017 with a persistent volume.

### 2. Backend

```bash
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload
```

Runs on `http://localhost:8000`. Interactive API docs at `http://localhost:8000/docs`.

If `python` isn't found, use `python3` instead, macOS and most Linux distros don't alias a plain `python` command by default.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:3000`.

`npm install` reports 2 moderate vulnerabilities. Both trace to a single advisory (PostCSS CSS-stringify XSS) in a copy of PostCSS bundled inside Next.js itself, not a direct dependency. It only matters if untrusted CSS text is run through PostCSS and rendered, which never happens here, PostCSS only processes my own Tailwind source at build time. `npm audit fix --force` would downgrade Next.js to an old canary release to silence it, which is worse than leaving it alone, so I left it as is.

## Standalone Geometry Engine

The geometry analysis runs on its own, directly on a `.STEP` file, with no backend or database:

```bash
python geometry/analyze.py "path/to/part.step"
```

Example output (vendra-bracket):

```json
{
  "bounding_box_mm": { "length": 90.0, "width": 90.0, "height": 41.0 },
  "volume_cm3": 40.96,
  "surface_area_cm2": 166.85,
  "bbox_surface_area_cm2": 309.6,
  "features": {
    "face_count": 17,
    "edge_count": 45,
    "holes_detected": 4,
    "estimated_setups": 2,
    "complexity_score": 0.0
  }
}
```

`complexity_score` is `0.0` from the standalone engine by design: complexity depends on stock volume, which is a pricing concept, so it is computed in the pricing layer rather than the geometry layer.

## Example Upload Flow

1. Open `http://localhost:3000`.
2. Click the drop zone and select a `.STEP` or `.STP` file.
3. Set a quantity with the stepper.
4. Click **Generate Quote**.
5. The quote appears inline with a blueprint preview of the part, the geometry, the cost breakdown, and the lead time.
6. Every quote is saved to the quote history table below. Click any row to open the full detail.
7. Use the status dropdown in the detail view to update a quote (new / quoted / reviewed / archived).

## Example Quote Output

`POST /quotes` with the bracket at quantity 10 returns:

```json
{
  "file_name": "vendra-bracket.STEP",
  "quantity": 10,
  "material": "6061 Aluminum",
  "geometry": {
    "bounding_box_mm": { "length": 90.0, "width": 90.0, "height": 41.0 },
    "stock_dimensions_mm": { "length": 90.0, "width": 90.0, "height": 50.8 },
    "volume_cm3": 40.96,
    "surface_area_cm2": 166.85
  },
  "features": {
    "face_count": 17,
    "edge_count": 45,
    "holes_detected": 4,
    "estimated_setups": 2,
    "complexity_score": 1.43
  },
  "cost_breakdown": {
    "material_cost_per_unit": 5.55,
    "machine_time_cost_per_unit": 35.36,
    "setup_cost_per_unit": 15.0,
    "total_cost_per_unit": 55.92,
    "total_order_cost": 559.16
  },
  "lead_time_days": 7,
  "status": "quoted"
}
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/quotes` | Upload a `.step` file + quantity, returns the quote |
| `GET` | `/quotes` | List all quotes (newest first) |
| `GET` | `/quotes/:id` | Single quote detail |
| `PATCH` | `/quotes/:id/status` | Update status (new / quoted / reviewed / archived) |

## Assumptions

These are the inputs and scope I set. Values marked (PDF) come from the provided baseline data.

- **Material:** 6061 Aluminum only, density 2.7 g/cm3, $5.00/kg (PDF).
- **Machine:** Haas CNC, $100/hour (PDF). I assume a 3-axis machine, which the setup detection relies on.
- **Material removal rate (roughing):** 150 cm3/min for 6061 aluminum.
- **Finishing rate:** 0.0014 hours per cm2 of surface area, calibrated against the PDF example output.
- **Setup:** 0.75 hours per fixturing orientation, multiplied by the estimated number of orientations, amortized across the order quantity. A typical 2-orientation part is 1.5 hours; a 3-orientation part is 2.25 hours. Setup is a one-time job cost; `setup_cost_per_unit` is each unit's amortized share, so it appears exactly once in the order total.
- **Stock volume:** the bounding box with its height snapped up to the nearest standard aluminum plate thickness (0.25", 0.5", 0.75", 1.0", 1.25", 1.5", 2.0", 2.5", 3.0", 4.0"). Material cost is based on stock volume, not the finished part volume, because a shop buys a raw block and machines the part out of it. The saw-cut-to-size fee is omitted.
- **Quantity discounts:** applied to machine time only, per the PDF (6 to 20: 10%, 21 to 100: 20%, 100+: 30%).
- **Holes:** a hole is a concave cylindrical surface that wraps most of the way around its axis. Coaxial bores of the same diameter are counted as one drilling operation, since they are machined in a single pass along one axis.
- **Setup count:** estimated from the number of distinct axes that the part's cylindrical faces point along, as a proxy for how many times a 3-axis machine must reorient the part.

## Known Limitations

- **No GD&T parsing.** Tolerance and surface-finish callouts embedded in the STEP file are not read. Tight tolerances raise real cost but are not reflected here. This would need an intelligence layer over the STEP annotations.
- **Hole detection is heuristic, and round-only.** The concavity plus sweep test is robust on the test parts (gear 1, bracket 4), but exotic geometry (intersecting bores, partial holes on an edge) can fall outside it. Coaxial bores are merged by design (drilling-effort count), which can read lower than a literal hole count. The detector only looks at cylindrical faces, so square or rectangular holes, which are bounded by planar faces and have no cylindrical face at all, are not detected.
- **Cutting time is a heuristic, not a CAM simulation.** Roughing uses material-removal rate and finishing uses surface area. A real shop would simulate toolpaths. This is most visible on very small parts, where the total is dominated by setup, which is realistic.
- **Complexity weights are hand-tuned, not fitted.** With no labeled quote data I chose interpretable proxies and weighted them by intuition. The inputs are correlated. With real data I would fit the weights instead of guessing.
- **Calibration rests on thin data, and the model runs conservative at high quantity.** I had the gear at quantity 1 from the PDF ($160 to $196, mine $153), plus my own live quotes for both parts from an online CNC quoting tool. At quantity 1 the agreement holds (the bracket landed 24% over their cheapest tier, in line with the gear). At quantity 100 it does not, my bracket comes out about 2.3 times their cheapest tier. The quantity discount only reduces machine time, and by quantity 100 setup is already nearly zero per unit, so there is little left to shrink, while a real shop's per-unit machine time itself drops further at volume through batched fixturing and unattended runs, which I do not model.

## Tests

```bash
python -m pip install -r requirements-dev.txt
python -m pytest
```

Covers the pricing math (`backend/pricing.py`: snap-to-stock-thickness, quantity discount tiers, complexity bounds, and behavioral checks like discounts applying to machine time and setup cost staying a one-time charge) and the geometry engine (`geometry/engine.py`: bounding box, volume, surface area, face/edge counts, and hole/setup detection against the gear and bracket fixtures in `tests/fixtures`). It's a small suite meant to catch regressions in the formulas and detectors, not a full integration test of the API or frontend.

## Report

See [REPORT.md](REPORT.md) for the technical write-up: CAD parsing, geometry, complexity detection, the pricing and lead-time formulas, assumptions, and what I would improve.
