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
    volume_cm3: number;
    surface_area_cm2: number;
  };
  features: {
    face_count: number;
    edge_count: number;
    holes_detected: number;
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
}

const fmt = (n: number) => `$${n.toFixed(2)}`;

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
    setSelected((prev) => prev ? { ...prev, status } : null);
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
      <header className="border-b border-zinc-800 px-8 py-4">
        <span className="text-white font-mono font-bold tracking-widest text-sm uppercase">
          Vendra
        </span>
        <span className="text-zinc-500 font-mono text-sm ml-2">
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
            className="bg-[#161b22] border border-zinc-800 rounded-lg p-6 space-y-4"
          >
            <div
              className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
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
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 w-24 text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!file || loading}
                className="ml-auto bg-blue-500 text-zinc-950 font-mono font-bold px-6 py-2 rounded hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            <div className="bg-[#161b22] border border-blue-500/40 rounded-lg p-6 space-y-6 shadow-[0_0_30px_rgba(59,130,246,0.08)]">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-white text-sm">
                    {result.file_name}
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">
                    Qty {result.quantity} · {result.material}
                  </p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {quotes.map((q) => (
                <div
                  key={q.id}
                  onClick={() => setSelected(q)}
                  className="bg-[#161b22] border border-zinc-800 rounded-lg p-4 cursor-pointer hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.06)] transition-all space-y-2"
                >
                  <p className="font-mono text-sm text-white truncate">
                    {q.file_name}
                  </p>
                  <p className="font-mono text-xl text-zinc-100">
                    {fmt(q.cost_breakdown.total_order_cost)}
                  </p>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-zinc-500">Qty {q.quantity}</p>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {q.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600">
                    {new Date(q.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
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
            className="bg-[#161b22] border border-zinc-700 rounded-lg p-6 max-w-lg w-full space-y-4 shadow-[0_0_40px_rgba(59,130,246,0.1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-mono text-white">{selected.file_name}</p>
                <p className="text-zinc-500 text-xs mt-1">
                  Qty {selected.quantity} · {selected.material}
                </p>
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
                className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 focus:outline-none focus:border-blue-500 cursor-pointer"
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
