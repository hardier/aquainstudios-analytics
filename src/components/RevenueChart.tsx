"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface DataPoint {
  period: string;
  etsy: number;
  tiktok: number;
  net: number;
}

function formatPeriod(iso: string, interval: string) {
  const d = new Date(iso);
  if (interval === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  if (interval === "week") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTick(v: number) {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
}

export function RevenueChart({ data, interval }: { data: DataPoint[]; interval: string }) {
  const formatted = data.map((d) => ({
    ...d,
    label: formatPeriod(d.period, interval),
    etsy: +d.etsy.toFixed(2),
    tiktok: +d.tiktok.toFixed(2),
    net: +d.net.toFixed(2),
  }));

  if (formatted.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        No data for this period. Sync a platform to see revenue trends.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={formatted} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={fmtTick} tick={{ fontSize: 11 }} width={48} />
        <Tooltip formatter={(v) => typeof v === "number" ? `$${v.toFixed(2)}` : v} />
        <Legend />
        <Line type="monotone" dataKey="etsy" stroke="#f97316" strokeWidth={2} dot={false} name="Etsy" />
        <Line type="monotone" dataKey="tiktok" stroke="#8b5cf6" strokeWidth={2} dot={false} name="TikTok" />
        <Line type="monotone" dataKey="net" stroke="#10b981" strokeWidth={2} dot={false} name="Net Revenue" strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}
