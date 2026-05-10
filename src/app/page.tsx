"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RevenueChart } from "@/components/RevenueChart";

type Range = "7d" | "30d" | "90d" | "all";
type ProductSort = "revenue" | "units" | "orders" | "avg_price";

// ── Types ──────────────────────────────────────────────────────────────────
interface KPIs {
  netRevenue: number; grossRevenue: number; totalFees: number;
  orderCount: number; avgOrderValue: number; refundRate: number;
}
interface PlatformBreakdown { platform: string; orders: number; grossRevenue: number; }
interface StatusBreakdown { status: string; count: number; }
interface OverviewData {
  kpis: KPIs;
  platformBreakdown: PlatformBreakdown[];
  statusBreakdown: StatusBreakdown[];
}
interface ChartPoint { period: string; etsy: number; tiktok: number; net: number; }
interface ChartData { interval: string; data: ChartPoint[]; }
interface ProductRow {
  productId: string; title: string; variantLabel: string | null;
  platform: string; platformListingId: string | null;
  units: number; order_count: number;
  gross: number; avg_price: number;
}
interface HistoryRow {
  period: string; productId: string; title: string;
  variantLabel: string | null; platform: string;
  units: number; gross: number;
}

function productUrl(platform: string, listingId: string | null): string | null {
  if (!listingId) return null;
  if (platform === "ETSY") return `https://www.etsy.com/listing/${listingId}`;
  if (platform === "TIKTOK") return `https://www.tiktok.com/view/product/${listingId}`;
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", PAID: "Awaiting Shipment", SHIPPED: "In Transit",
  COMPLETE: "Completed", CANCELLED: "Cancelled",
  REFUNDED: "Refunded", PARTIAL_REFUND: "Partial Refund",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800", PAID: "bg-blue-100 text-blue-800",
  SHIPPED: "bg-indigo-100 text-indigo-800", COMPLETE: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-500", REFUNDED: "bg-red-100 text-red-700",
  PARTIAL_REFUND: "bg-orange-100 text-orange-700",
};
const PLATFORM_COLORS: Record<string, string> = { ETSY: "bg-orange-500", TIKTOK: "bg-violet-500" };

// ── Sub-components ─────────────────────────────────────────────────────────
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function SortButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [range, setRange] = useState<Range>("30d");
  const [productSort, setProductSort] = useState<ProductSort>("revenue");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyInterval, setHistoryInterval] = useState("day");
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [ov, ch] = await Promise.all([
      fetch(`/api/analytics/overview?range=${range}`).then((r) => r.json()),
      fetch(`/api/analytics/revenue-chart?range=${range}`).then((r) => r.json()),
    ]);
    setOverview(ov);
    setChart(ch);
    setLoading(false);
  }, [range]);

  const fetchProducts = useCallback(async () => {
    const p = await fetch(`/api/analytics/products?range=${range}&sort=${productSort}`).then((r) => r.json());
    setProducts(p.products ?? []);
  }, [range, productSort]);

  const fetchHistory = useCallback(async () => {
    const h = await fetch(`/api/analytics/product-history?range=${range}`).then((r) => r.json());
    setHistory(h.rows ?? []);
    setHistoryInterval(h.interval ?? "day");
  }, [range]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const totalRevenue = (overview?.platformBreakdown ?? []).reduce((s, p) => s + p.grossRevenue, 0) || 1;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AquaInStudios Analytics</h1>
          <p className="text-sm text-gray-500">Unified sales dashboard</p>
        </div>
        <Link href="/settings" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          ⚙ Settings
        </Link>
      </div>

      {/* Range selector */}
      <div className="mb-6 flex gap-2">
        {(["7d", "30d", "90d", "all"] as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              range === r ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            {r === "all" ? "All time" : r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-gray-400">Loading…</div>
      ) : overview ? (
        <>
          {/* KPI row */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Net Profit" value={fmt(overview.kpis.netRevenue)} sub={`Gross ${fmt(overview.kpis.grossRevenue)}`} />
            <KpiCard label="Orders" value={overview.kpis.orderCount.toString()} />
            <KpiCard label="Avg Order Value" value={fmt(overview.kpis.avgOrderValue)} />
            <KpiCard label="Refund Rate" value={`${(overview.kpis.refundRate * 100).toFixed(1)}%`} sub={`Fees ${fmt(overview.kpis.totalFees)}`} />
          </div>

          {/* Revenue chart */}
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Revenue Over Time</h2>
            {chart && <RevenueChart data={chart.data} interval={chart.interval} />}
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            {/* Platform breakdown */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">Platform Breakdown</h2>
              {overview.platformBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400">No data yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {overview.platformBreakdown.map((p) => {
                    const pct = Math.round((p.grossRevenue / totalRevenue) * 100);
                    return (
                      <div key={p.platform}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium text-gray-700">{p.platform}</span>
                          <span className="text-gray-500">{fmt(p.grossRevenue)} · {p.orders} orders</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100">
                          <div className={`h-2 rounded-full ${PLATFORM_COLORS[p.platform] ?? "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order status */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">Order Status</h2>
              {overview.statusBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400">No data yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {overview.statusBreakdown.map((s) => (
                    <span key={s.status} className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[s.status] ?? s.status} — {s.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Product breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-700">Product Breakdown</h2>
              <div className="flex gap-1.5">
                <SortButton label="Revenue" active={productSort === "revenue"} onClick={() => setProductSort("revenue")} />
                <SortButton label="Units Sold" active={productSort === "units"} onClick={() => setProductSort("units")} />
                <SortButton label="Orders" active={productSort === "orders"} onClick={() => setProductSort("orders")} />
                <SortButton label="Avg Price" active={productSort === "avg_price"} onClick={() => setProductSort("avg_price")} />
              </div>
            </div>
            {products.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400">No data yet. Sync a platform in Settings.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Variant</th>
                      <th className="px-5 py-3">Platform</th>
                      <th className="px-5 py-3 text-right">Units</th>
                      <th className="px-5 py-3 text-right">Orders</th>
                      <th className="px-5 py-3 text-right">Avg Price</th>
                      <th className="px-5 py-3 text-right">Revenue</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => (
                      <tr key={`${p.productId}-${p.variantLabel}-${i}`} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-800 min-w-[200px] whitespace-normal break-words" title={p.title}>{p.title}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{p.variantLabel ?? "—"}</td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${PLATFORM_COLORS[p.platform] ?? "bg-gray-400"}`}>
                            {p.platform}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-600">{p.units}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{p.order_count}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{fmt(p.avg_price)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(p.gross)}</td>
                        <td className="px-5 py-3 text-right">
                          {productUrl(p.platform, p.platformListingId) ? (
                            <a href={productUrl(p.platform, p.platformListingId)!} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-indigo-500 hover:underline">
                              View ↗
                            </a>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Product History */}
          <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-700">
                Product History{" "}
                <span className="ml-1 text-xs font-normal text-gray-400">
                  ({historyInterval === "week" ? "weekly" : "daily"} breakdown)
                </span>
              </h2>
            </div>
            {history.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400">No data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                      <th className="px-5 py-3">Period</th>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Variant</th>
                      <th className="px-5 py-3">Platform</th>
                      <th className="px-5 py-3 text-right">Units</th>
                      <th className="px-5 py-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      const d = new Date(h.period);
                      const label = historyInterval === "week"
                        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " wk"
                        : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
                      return (
                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{label}</td>
                          <td className="px-5 py-3 font-medium text-gray-800 min-w-[200px] whitespace-normal break-words" title={h.title}>{h.title}</td>
                          <td className="px-5 py-3 text-xs text-gray-500">{h.variantLabel ?? "—"}</td>
                          <td className="px-5 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${PLATFORM_COLORS[h.platform] ?? "bg-gray-400"}`}>
                              {h.platform}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">{h.units}</td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(h.gross)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
