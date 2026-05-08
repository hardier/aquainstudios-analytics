"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Range = "7d" | "30d" | "90d" | "all";

interface KPIs {
  netRevenue: number;
  grossRevenue: number;
  totalFees: number;
  orderCount: number;
  avgOrderValue: number;
  refundRate: number;
}

interface PlatformBreakdown {
  platform: string;
  orders: number;
  grossRevenue: number;
}

interface StatusBreakdown {
  status: string;
  count: number;
}

interface TopProduct {
  productId: string;
  title: string;
  unitsSold: number;
  grossRevenue: number;
}

interface OverviewData {
  range: string;
  kpis: KPIs;
  platformBreakdown: PlatformBreakdown[];
  statusBreakdown: StatusBreakdown[];
  topProducts: TopProduct[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid / Awaiting Shipment",
  SHIPPED: "In Transit",
  COMPLETE: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  PARTIAL_REFUND: "Partial Refund",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PAID: "bg-blue-100 text-blue-800",
  SHIPPED: "bg-indigo-100 text-indigo-800",
  COMPLETE: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-500",
  REFUNDED: "bg-red-100 text-red-700",
  PARTIAL_REFUND: "bg-orange-100 text-orange-700",
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState<Range>("30d");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics/overview?range=${range}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [range]);

  const etsyRevenue = data?.platformBreakdown.find((p) => p.platform === "ETSY")?.grossRevenue ?? 0;
  const tiktokRevenue = data?.platformBreakdown.find((p) => p.platform === "TIKTOK")?.grossRevenue ?? 0;
  const totalRevenue = etsyRevenue + tiktokRevenue || 1;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AquaInStudios Analytics</h1>
          <p className="text-sm text-gray-500">Unified sales dashboard</p>
        </div>
        <Link
          href="/settings"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ⚙ Settings
        </Link>
      </div>

      {/* Range selector */}
      <div className="mb-6 flex gap-2">
        {(["7d", "30d", "90d", "all"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              range === r
                ? "bg-indigo-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {r === "all" ? "All time" : r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-gray-400">Loading…</div>
      ) : data ? (
        <>
          {/* KPI row */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Net Revenue" value={fmt(data.kpis.netRevenue)} sub={`Gross ${fmt(data.kpis.grossRevenue)}`} />
            <KpiCard label="Orders" value={data.kpis.orderCount.toString()} />
            <KpiCard label="Avg Order Value" value={fmt(data.kpis.avgOrderValue)} />
            <KpiCard label="Refund Rate" value={`${(data.kpis.refundRate * 100).toFixed(1)}%`} sub={`Fees ${fmt(data.kpis.totalFees)}`} />
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            {/* Platform breakdown */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">Platform Breakdown</h2>
              {data.platformBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400">No data yet. Sync a platform in Settings.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {data.platformBreakdown.map((p) => {
                    const pct = Math.round((p.grossRevenue / totalRevenue) * 100);
                    return (
                      <div key={p.platform}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium text-gray-700">{p.platform}</span>
                          <span className="text-gray-500">{fmt(p.grossRevenue)} · {p.orders} orders</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full bg-indigo-500"
                            style={{ width: `${pct}%` }}
                          />
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
              {data.statusBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400">No data yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.statusBreakdown.map((s) => (
                    <span
                      key={s.status}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {STATUS_LABELS[s.status] ?? s.status} — {s.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top products */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-700">Top Products</h2>
            </div>
            {data.topProducts.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400">No data yet. Sync a platform in Settings.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3 text-right">Units Sold</th>
                    <th className="px-5 py-3 text-right">Gross Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p, i) => (
                    <tr key={p.productId ?? i} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800">{p.title}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{p.unitsSold}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">{fmt(p.grossRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
