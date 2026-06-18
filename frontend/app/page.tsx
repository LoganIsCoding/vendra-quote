"use client";

import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface BoundingBox {
  length: number;
  width: number;
  height: number;
}

interface Quote {
  id: string;
  file_name: string;
  quantity: number;
  material: string;
  geometry: {
    bounding_box_mm: BoundingBox;
    stock_dimensions_mm: BoundingBox;
    volume_cm3: number;
    surface_area_cm2: number;
  };
  features: {
    face_count: number;
    edge_count: number;
    holes_detected: number;
    estimated_setups: number;
    complexity_score: number;
  };
  cost_breakdown: {
    material_cost_per_unit: number;
    machine_time_cost_per_unit: number;
    setup_cost_per_unit: number;
    total_cost_per_unit: number;
    total_order_cost: number;
  };
  lead_time_days: number;
  status: string;
  created_at: string;
  preview_svg: string;
}

const fmt = (n: number) => `$${n.toFixed(2)}`;

function PartPreview({ svg, className }: { svg?: string; className?: string }) {
  if (!svg) return null;
  return (
    <img
      src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
      alt="part preview"
      className={className}
    />
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Quote | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchQuotes();
  }, []);

  async function updateStatus(id: string, status: string) {
    await fetch(`${API}/quotes/${id}/status?status=${status}`, { method: "PATCH" });
    setSelected((prev) => (prev ? { ...prev, status } : null));
    await fetchQuotes();
  }

  async function fetchQuotes() {
    const res = await fetch(`${API}/quotes`);
    const data = await res.json();
    setQuotes(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("quantity", String(quantity));
      const res = await fetch(`${API}/quotes`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "Failed to generate quote.");
      } else {
        setResult(data);
        await fetchQuotes();
      }
    } catch {
      setError("Could not reach the backend. Is it running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-zinc-100 font-sans">
      <header className="border-b border-zinc-800 px-8 py-4 flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vendra-logo.svg" alt="Vendra" className="h-7" />
        <span className="text-zinc-500 font-mono text-sm ml-3">
          // CNC Quote Engine
        </span>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-12 space-y-12">
        {/* Upload */}
        <section>
          <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4">
            New Quote
          </h2>
          <form
            onSubmit={handleSubmit}
            className="bg-[#161b22] border border-zinc-800 rounded-none p-6 space-y-4"
          >
            <div
              className="border-2 border-dashed border-zinc-700 rounded-none p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".step,.stp"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <p className="text-white font-mono text-sm">{file.name}</p>
              ) : (
                <p className="text-zinc-500 text-sm">
                  Drop a{" "}
                  <span className="text-zinc-300">.STEP</span> file here or
                  click to browse
                </p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                Quantity
              </label>
              <div className="flex items-stretch border border-zinc-700">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 bg-zinc-800 text-zinc-300 font-mono hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-16 text-center bg-zinc-900 border-x border-zinc-700 py-2 text-zinc-100 font-mono focus:outline-none focus:bg-zinc-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-3 bg-zinc-800 text-zinc-300 font-mono hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  +
                </button>
              </div>
              <button
                type="submit"
                disabled={!file || loading}
                className="ml-auto bg-blue-500 text-zinc-950 font-mono font-bold px-6 py-2 rounded-none hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Analyzing..." : "Generate Quote"}
              </button>
            </div>
          </form>
          {error && (
            <p className="mt-3 text-sm font-mono text-red-400">{error}</p>
          )}
        </section>

        {/* Result */}
        {result && (
          <section>
            <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4">
              Quote Result
            </h2>
            <div className="bg-[#161b22] border border-blue-500/40 rounded-none p-6 space-y-6 shadow-[0_0_30px_rgba(59,130,246,0.08)]">
              <div className="flex justify-between items-start gap-6">
                <div className="flex gap-5">
                  <div className="w-32 h-32 shrink-0 border border-zinc-800 bg-[#0d1117] flex items-center justify-center">
                    <PartPreview
                      svg={result.preview_svg}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <p className="font-mono text-white text-sm">
                      {result.file_name}
                    </p>
                    <p className="text-zinc-500 text-xs mt-1">
                      Qty {result.quantity} · {result.material}
                    </p>
                  </div>
                </div>
                <p className="font-mono text-2xl">
                  {fmt(result.cost_breakdown.total_order_cost)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">
                    Geometry
                  </p>
                  <div className="space-y-1 text-sm font-mono">
                    <p className="text-zinc-300">
                      Bounding box:{" "}
                      <span className="text-zinc-100">
                        {result.geometry.bounding_box_mm.length} ×{" "}
                        {result.geometry.bounding_box_mm.width} ×{" "}
                        {result.geometry.bounding_box_mm.height} mm
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Stock:{" "}
                      <span className="text-zinc-100">
                        {result.geometry.stock_dimensions_mm.length} ×{" "}
                        {result.geometry.stock_dimensions_mm.width} ×{" "}
                        {result.geometry.stock_dimensions_mm.height} mm
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Volume:{" "}
                      <span className="text-zinc-100">
                        {result.geometry.volume_cm3} cm³
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Surface area:{" "}
                      <span className="text-zinc-100">
                        {result.geometry.surface_area_cm2} cm²
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Faces:{" "}
                      <span className="text-zinc-100">
                        {result.features.face_count}
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Edges:{" "}
                      <span className="text-zinc-100">
                        {result.features.edge_count}
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Holes detected:{" "}
                      <span className="text-zinc-100">
                        {result.features.holes_detected}
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Estimated setups:{" "}
                      <span className="text-zinc-100">
                        {result.features.estimated_setups}
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Complexity:{" "}
                      <span className="text-zinc-100">
                        {result.features.complexity_score}
                      </span>
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">
                    Cost Breakdown
                  </p>
                  <div className="space-y-1 text-sm font-mono">
                    <p className="text-zinc-300">
                      Material/unit:{" "}
                      <span className="text-zinc-100">
                        {fmt(result.cost_breakdown.material_cost_per_unit)}
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Machine time/unit:{" "}
                      <span className="text-zinc-100">
                        {fmt(
                          result.cost_breakdown.machine_time_cost_per_unit
                        )}
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Setup/unit:{" "}
                      <span className="text-zinc-100">
                        {fmt(result.cost_breakdown.setup_cost_per_unit)}
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      Per unit:{" "}
                      <span className="text-zinc-100">
                        {fmt(result.cost_breakdown.total_cost_per_unit)}
                      </span>
                    </p>
                    <p className="text-zinc-300 pt-2 border-t border-zinc-800">
                      Total order:{" "}
                      <span className="text-white font-bold">
                        {fmt(result.cost_breakdown.total_order_cost)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm font-mono text-zinc-300">
                Lead time:{" "}
                <span className="text-zinc-100">
                  {result.lead_time_days} business days
                </span>
              </p>
            </div>
          </section>
        )}

        {/* Quote History */}
        <section>
          <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4">
            Quote History
          </h2>
          {quotes.length === 0 ? (
            <p className="text-zinc-600 text-sm font-mono">No quotes yet.</p>
          ) : (
            <div className="border border-zinc-800 overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="text-xs text-zinc-500 uppercase tracking-widest text-left border-b border-zinc-800">
                    <th className="px-4 py-3 font-normal">Part</th>
                    <th className="px-4 py-3 font-normal text-right">Qty</th>
                    <th className="px-4 py-3 font-normal text-right">Complexity</th>
                    <th className="px-4 py-3 font-normal text-right">Lead</th>
                    <th className="px-4 py-3 font-normal text-right">Total</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr
                      key={q.id}
                      onClick={() => setSelected(q)}
                      className="border-b border-zinc-800/60 last:border-0 cursor-pointer hover:bg-[#1c2230] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 shrink-0 border border-zinc-800 bg-[#0d1117] flex items-center justify-center">
                            <PartPreview
                              svg={q.preview_svg}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <span className="text-white truncate max-w-[14rem]">
                            {q.file_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {q.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {q.features.complexity_score}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {q.lead_time_days}d
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-100">
                        {fmt(q.cost_breakdown.total_order_cost)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-none bg-zinc-800 text-zinc-300">
                          {q.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                        {new Date(q.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#161b22] border border-zinc-700 rounded-none p-6 max-w-lg w-full space-y-4 shadow-[0_0_40px_rgba(59,130,246,0.1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex gap-4">
                <div className="w-24 h-24 shrink-0 border border-zinc-800 bg-[#0d1117] flex items-center justify-center">
                  <PartPreview
                    svg={selected.preview_svg}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <p className="font-mono text-white">{selected.file_name}</p>
                  <p className="text-zinc-500 text-xs mt-1">
                    Qty {selected.quantity} · {selected.material}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-zinc-500 hover:text-zinc-300 font-mono"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 text-sm font-mono">
              <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">
                Geometry
              </p>
              <p className="text-zinc-300">
                Bounding box:{" "}
                <span className="text-zinc-100">
                  {selected.geometry.bounding_box_mm.length} ×{" "}
                  {selected.geometry.bounding_box_mm.width} ×{" "}
                  {selected.geometry.bounding_box_mm.height} mm
                </span>
              </p>
              <p className="text-zinc-300">
                Stock:{" "}
                <span className="text-zinc-100">
                  {selected.geometry.stock_dimensions_mm.length} ×{" "}
                  {selected.geometry.stock_dimensions_mm.width} ×{" "}
                  {selected.geometry.stock_dimensions_mm.height} mm
                </span>
              </p>
              <p className="text-zinc-300">
                Volume:{" "}
                <span className="text-zinc-100">
                  {selected.geometry.volume_cm3} cm³
                </span>
              </p>
              <p className="text-zinc-300">
                Surface area:{" "}
                <span className="text-zinc-100">
                  {selected.geometry.surface_area_cm2} cm²
                </span>
              </p>
              <p className="text-zinc-300">
                Faces:{" "}
                <span className="text-zinc-100">
                  {selected.features.face_count}
                </span>
              </p>
              <p className="text-zinc-300">
                Edges:{" "}
                <span className="text-zinc-100">
                  {selected.features.edge_count}
                </span>
              </p>
              <p className="text-zinc-300">
                Holes detected:{" "}
                <span className="text-zinc-100">
                  {selected.features.holes_detected}
                </span>
              </p>
              <p className="text-zinc-300">
                Estimated setups:{" "}
                <span className="text-zinc-100">
                  {selected.features.estimated_setups}
                </span>
              </p>
              <p className="text-zinc-300">
                Complexity:{" "}
                <span className="text-zinc-100">
                  {selected.features.complexity_score}
                </span>
              </p>
            </div>

            <div className="space-y-1 text-sm font-mono border-t border-zinc-800 pt-4">
              <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">
                Cost Breakdown
              </p>
              <p className="text-zinc-300">
                Material/unit:{" "}
                <span className="text-zinc-100">
                  {fmt(selected.cost_breakdown.material_cost_per_unit)}
                </span>
              </p>
              <p className="text-zinc-300">
                Machine time/unit:{" "}
                <span className="text-zinc-100">
                  {fmt(selected.cost_breakdown.machine_time_cost_per_unit)}
                </span>
              </p>
              <p className="text-zinc-300">
                Setup/unit:{" "}
                <span className="text-zinc-100">
                  {fmt(selected.cost_breakdown.setup_cost_per_unit)}
                </span>
              </p>
              <p className="text-zinc-300">
                Per unit:{" "}
                <span className="text-zinc-100">
                  {fmt(selected.cost_breakdown.total_cost_per_unit)}
                </span>
              </p>
              <p className="text-zinc-300 pt-2 border-t border-zinc-800">
                Total:{" "}
                <span className="text-white font-bold">
                  {fmt(selected.cost_breakdown.total_order_cost)}
                </span>
              </p>
            </div>

            <p className="text-sm font-mono text-zinc-300">
              Lead time:{" "}
              <span className="text-zinc-100">
                {selected.lead_time_days} business days
              </span>
            </p>

            <div className="border-t border-zinc-800 pt-4 flex justify-between items-center">
              <span className="text-xs font-mono text-zinc-600">
                {new Date(selected.created_at).toLocaleString()}
              </span>
              <select
                value={selected.status}
                onChange={(e) => updateStatus(selected.id, e.target.value)}
                className="text-xs font-mono px-2 py-0.5 rounded-none bg-zinc-800 text-zinc-300 border border-zinc-700 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="new">new</option>
                <option value="quoted">quoted</option>
                <option value="reviewed">reviewed</option>
                <option value="archived">archived</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
