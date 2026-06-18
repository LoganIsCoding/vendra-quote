# Technical Report

## How the CAD file is parsed

STEP files are parsed with **cadquery**, which wraps **pythonOCC**, which wraps **OpenCASCADE**, the open-source C++ CAD kernel used by FreeCAD and others. The chain is: my code, to cadquery, to pythonOCC, to OpenCASCADE. This is the standard path for serious STEP work in Python, and there is no comparable JavaScript option at this fidelity. That is the main reason the whole geometry layer is Python, which in turn is why the backend is Python (FastAPI), so it can import the engine directly.

`cq.importers.importStep()` loads the file into a solid. Face and edge topology is read with `shape.faces()` and `shape.edges()`, and per-face geometry (cylinders, normals, axes) is read through the OpenCASCADE adaptors.

## How the part preview is rendered

Each quote stores a small preview image, generated server side from the same solid the geometry engine already loaded. cadquery's `getSVG()` projects the solid into an isometric wireframe with hidden edges shown in a muted color, the same convention as a machinist's blueprint, so I render that directly instead of a shaded raster view.

That avoids standing up a second rendering pipeline (no headless 3D viewer or WebGL renderer just for a thumbnail), stays sharp at every size it's displayed at since it's a vector, and stores as a plain text field on the quote document with no file storage or blob handling. It also keeps hidden lines visible, a bore through the back face shows as a solid line in the muted hidden-line color but would be hidden entirely in a shaded render, which matters more for sanity-checking an upload than for looking polished. cadquery normally dashes hidden lines rather than drawing them solid, but I dropped that for a VS Code-specific reason covered in the debugging note below.

The tradeoff is that a wireframe reads less intuitively to someone unfamiliar with engineering drawings, and it can't be rotated like a real 3D viewer. That's a fair scope cut for a preview whose job is just to confirm this is the part you meant to upload, not full CAD inspection.

## How geometry is calculated

All base quantities come from OpenCASCADE and are converted to convenient units:

- **Volume:** `solid.Volume()`, mm3 to cm3.
- **Surface area:** `solid.Area()`, mm2 to cm2.
- **Bounding box:** `solid.BoundingBox()`, axis-aligned extents in mm.
- **Bounding box surface area:** computed from the extents, used later as an accessibility signal.
- **Face and edge counts:** the lengths of the face and edge lists.

## How holes are detected

My first attempt was to just count cylindrical faces, but that badly overstates holes: gear-tooth surfaces, external rounds, fillets, and curved edges are all cylinders too. On the gear that approach gives 70; the part actually has one hole. So the detector needs to be more deliberate than that, it works in three steps:

1. **Concavity.** For each cylindrical face I take its outward normal (corrected for the face orientation) and compare it to the radial direction from the cylinder axis to the surface. If the normal points toward the axis, material wraps around an empty bore, so the face is part of a hole. If it points away, it is a boss or an external round, which I ignore.
2. **Coaxial grouping.** A single bore can be split into several faces. I group concave faces that share an axis line and radius so one bore counts once.
3. **Sweep threshold.** A group counts as a hole only if its faces together wrap at least 270 degrees around the axis. This excludes concave fillets and inside corners, which sweep far less. For example the bracket's inner L-corner is concave but only sweeps 90 degrees.

This gets the gear to 1 and the bracket to 4, matching what's actually there. Coaxial same-diameter bores are intentionally merged, because the hole count feeds a drilling-effort signal and two collinear bores are one drilling pass.

The detector only considers cylindrical faces, so it only finds round holes. A square or rectangular hole has no cylindrical face at all, it is bounded by planar faces meeting at right angles, so it passes through undetected. Catching that case would need a second detector built around planar-face loops instead of cylinders, which neither test part required.

## How setups are detected

This is the heuristic I am most happy with. Each cylindrical face has an axis. I record the dominant axis (X, Y, or Z) of each cylindrical face's direction and count the distinct axes. On a 3-axis machine, features facing different axes require the part to be reoriented (flipped) between operations, so the number of distinct cylinder axes is a proxy for the number of setups. It returns 2 for the gear and 2 for the bracket, and held up when I ran it against a few other STEP files informally, matching how those parts would actually be fixtured. The setup count then drives both setup cost and lead time.

## How complexity is detected

Complexity is a single multiplier, from 1.0 up to a cap of 4.0, built from three signals that each map to a distinct physical cost driver:

```
complexity = 1.0
  + cyl_ratio     * 0.5   (holes per face: drilling-operation density)
  + sa_to_vol     / 20    (surface area over volume: fine-detail penalty)
  + accessibility * 0.2   (part surface over bounding-box surface: hard-to-reach features)
```

- `cyl_ratio` is `holes_detected / face_count`, how much of the part's geometry is taken up by drilling operations.
- `sa_to_vol` is `surface_area_cm2 / volume_cm3`, the same ratio computed in the geometry engine.
- `accessibility` is `surface_area_cm2 / bbox_surface_area_cm2`, how much more surface the part has than a plain block its same size. A simple block sits close to 1; a part with deep pockets or overhangs a tool has to reach around runs higher.

The 0.5, /20, and 0.2 weights aren't derived from a formula, I picked them by running both test parts through the score and adjusting until the gear (small and intricate) landed a bit above the bracket (larger and simpler) without either one blowing past the cap. With no labeled quote data to fit against, that's what was available, and I'd rather say so plainly than dress it up as more rigorous than it is.

The signals are correlated, which I acknowledge. Two notes on what is and is not included:

- `sa_to_vol` is scale-dependent, which is deliberate here: it is the one signal that flags a small but intricate part (the gear) as harder than a large simple one (the bracket). The gear scores 1.50, the bracket 1.43.
- Material removal is already priced into roughing time, and orientation count into setup cost, so neither is added to complexity. That avoids charging the same physical work twice.

## How the pricing formula works

All figures are per unit unless stated.

**Material cost** uses stock volume, because a shop buys a raw block and machines the part out of it:

```
stock height = part height snapped up to the nearest standard plate thickness
stock volume = bbox length * bbox width * stock height
material cost = stock volume * 2.7 g/cm3 / 1000 * $5.00/kg
```

- `stock height` snaps the bounding box height up to the nearest standard aluminum plate thickness, since a shop buys plate stock in fixed sizes, not the part's exact height.
- `stock volume` is the bounding box footprint times that snapped height, the raw block the part gets machined out of.
- `material cost` converts that volume to mass (density in g/cm3, divided by 1000 to get kg) and prices it at $5.00/kg.

**Machine time cost** splits cutting into the two physical phases, then scales by complexity:

```
material removed = stock volume - part volume
roughing hours    = material removed / 150 cm3/min / 60
finishing hours   = surface area * 0.0014 hr/cm2
machine cost      = (roughing + finishing) * complexity * $100/hr * (1 - discount)
```

- `material removed` is stock volume minus the actual part volume, the material that has to be cut away.
- `roughing hours` converts that volume to time at the assumed 150 cm3/min removal rate, then from minutes to hours.
- `finishing hours` is surface area times a finishing rate that's already expressed in hours per cm2, so no extra unit conversion is needed there.
- `(1 - discount)` applies the quantity discount as a fractional reduction, 0.30 for the 30% tier keeps the remaining 70% of cost, the standard way to apply a percentage discount.

Roughing is bulk material removal, governed by the removal rate. Finishing is the surface passes, governed by surface area. Adding the finishing term matters because the PDF lists surface area as an allowed input and its example has a substantial machine cost that pure removal-rate cannot produce. Quantity discounts apply to machine time only, per the PDF.

**Setup cost** is per orientation, amortized across the order:

```
setup cost = 0.75 hr * estimated setups * $100/hr / quantity
```

- `0.75 hr` is the per-orientation setup time (where that number comes from is below).
- `estimated setups` is the number of distinct fixturing orientations the geometry engine detected.
- dividing by `quantity` amortizes that one-time setup labor across the whole order.

Setup is a one-time job cost. Because the order total multiplies the per-unit total by quantity, the divide and the multiply cancel and setup is counted exactly once across the batch. The per-unit line is each unit's amortized share, which is why it shrinks as quantity rises.

The PDF's own worked example shows $15 of setup cost per unit at quantity 10, which works out to 1.5 hours of setup labor (`$15 × 10 / $100/hr`) for whatever part it was modeling. I treated that 1.5 hours as the cost of a typical 2-orientation part and divided it evenly across the two orientations, 0.75 hours each, so the per-orientation rate is anchored to the PDF's own number rather than picked independently. That means a real shop's practical minimum (nobody bills less than an hour for a setup, even a quick one) isn't reflected here, a single-orientation part comes out a bit cheap on setup. I kept it anchored to the PDF's example rather than padding it, since that's the one piece of ground truth I have to calibrate against.

## How the lead-time formula works

```
production days   = max(1, round(cutting hours * quantity / 8))
complexity buffer = round((complexity - 1.0) * 2)
lead time         = 5 + production days + complexity buffer
```

The 5-day base is the minimum shop lead time. Production days converts total machine hours into 8-hour workdays. The complexity buffer is how complexity enters lead time at all, since production days uses raw cutting hours. It is scaled by 2 so it stays meaningful now that complexity scores sit around 1.4 to 1.5, adding roughly 1 day for these parts and more for harder ones.

## Calibration

My only real ground truth was the gear at quantity 1, where two competitors quoted $160 to $196 for a matching 7-day lead time, and my model lands at $153, about 5% under the directly comparable tier. I didn't tune the formula to hit this number, setup hours and the finishing rate came from the PDF's own worked example, so the agreement is incidental, not engineered. I later ran my own live quotes against an online CNC tool for both parts at quantity 1 and 100 to see how that agreement held up at scale. At quantity 1 it still holds, the bracket lands 24% over its cheapest tier, in the same range as the gear comparison. At quantity 100 it breaks down: my bracket comes out around 2.3x their cheapest tier, because my quantity discount only touches machine time, and by then setup cost is already near zero per unit, so there's little left to shrink. A real shop's machine time itself gets cheaper at volume too, through batched fixturing and unattended runs, which I don't model.
## A debugging note: the part preview rendering bug

The blueprint previews bled faint diagonal lines across the page, but only in the VS Code Simple Browser, every other browser rendered them cleanly. The AI assistant cycled through unrelated fixes, viewBox tweaks, overflow rules, swapping the img for inline SVG, because its repros were opened in Chrome, where the bug never showed up. I broke the loop by testing in the actual broken environment myself: uploading different parts produced the same lines in the same position every time, which meant they weren't coming from the geometry, and then had it search for documented VS Code-specific SVG rendering issues instead of guessing further.

The cause: cadquery dashes hidden lines with very small dasharray values, and the Simple Browser's renderer mis-tiles those tiny dashes into streaks across the page. Dropping the dasharray and rendering hidden lines solid fixed it everywhere, a one-line change. The lesson wasn't the fix itself, it was pinning down a clean reproduction before chasing more of them.

## Testing

`tests/test_pricing.py` and `tests/test_geometry.py` import `backend.pricing` and `geometry.engine` directly and call the real functions in-process, since the pricing formula and the hole/setup detectors are where a regression would actually originate, and pure functions are the cheapest thing to test (the whole suite runs in about a second).

The geometry tests check the gear and bracket fixtures against the known-good bounding box, volume, surface area, and face/edge/hole/setup counts already documented in the README. The pricing tests check behavioral contracts instead of exact totals, the stock-thickness snap rounds up, discount tiers apply at the right quantities, complexity stays bounded, setup cost stays a one-time charge. I tried pinning the full `calculate()` output to one example first, but that broke on every legitimate pricing tweak (I'd already retuned setup hours, the finishing rate, and the complexity weights more than once), so I switched to testing relationships instead of numbers, which keeps the suite useful through normal iteration.

I skipped API-level integration tests (FastAPI's `TestClient` against Mongo). It's doable, but would mostly exercise FastAPI's routing and Motor's driver rather than my own logic, and I'd already verified the full request cycle manually against the running backend, so it wasn't worth the added infrastructure for a take-home on a deadline.

## What I would improve with more time

- **GD&T parsing.** Read tolerance and surface-finish callouts and apply cost multipliers for tight features. This is the largest missing real-world cost driver.
- **Fitted pricing weights.** With a corpus of real quotes, replace the hand-tuned complexity weights and the finishing rate with fitted values, and orthogonalize the correlated inputs.
- **Toolpath-aware cutting time.** Replace the roughing-plus-finishing heuristic with a closer model of minimum tool diameter and accessibility, which is what makes intricate small parts genuinely expensive.
- **Multi-material support.** A material table with per-material density, machinability, and cost would make the engine usable beyond 6061 aluminum.
- **Volume-scaling cost model.** My own quantity-100 check against a live competitor quote showed I run roughly 2.3 times their price at that volume. The fix is modeling batch efficiency directly, multi-part fixturing, unattended run time, amortized programming, rather than relying on a flat percentage discount on machine time.
- **More calibration data.** Two competitor data points (one PDF, one live) at quantity 1 and one live point at quantity 100 is still thin, especially since the live tool gave different prices for the same part on different days. More samples across more parts and quantities would tighten this.
