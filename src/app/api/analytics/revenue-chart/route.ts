import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getRangeConfig(range: string): { gte: Date; interval: string } {
  const now = new Date();
  if (range === "7d") return { gte: new Date(now.getTime() - 7 * 86400000), interval: "day" };
  if (range === "90d") return { gte: new Date(now.getTime() - 90 * 86400000), interval: "week" };
  if (range === "all") return { gte: new Date(0), interval: "month" };
  // default 30d
  return { gte: new Date(now.getTime() - 30 * 86400000), interval: "day" };
}

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "30d";
  const { gte, interval } = getRangeConfig(range);

  // Use raw SQL for date truncation — Prisma groupBy doesn't support date_trunc
  const rows = await prisma.$queryRawUnsafe<
    { period: Date; platform: string; gross: number; fees: number }[]
  >(`
    SELECT
      date_trunc('${interval}', o."placedAt") AS period,
      o.platform::text AS platform,
      SUM(o."totalUsd")::float AS gross,
      COALESCE(SUM(f.total_fees), 0)::float AS fees
    FROM orders o
    LEFT JOIN (
      SELECT "orderId", SUM("amountUsd") AS total_fees
      FROM fees
      GROUP BY "orderId"
    ) f ON f."orderId" = o.id
    WHERE o."placedAt" >= $1
      AND o.status NOT IN ('CANCELLED', 'REFUNDED')
    GROUP BY period, o.platform
    ORDER BY period ASC
  `, gte);

  // Pivot into { period, etsy, tiktok, net } shape for the chart
  const byPeriod: Record<string, { period: string; etsy: number; tiktok: number; net: number }> = {};

  for (const row of rows) {
    const key = new Date(row.period).toISOString();
    if (!byPeriod[key]) {
      byPeriod[key] = { period: key, etsy: 0, tiktok: 0, net: 0 };
    }
    const net = row.gross - row.fees;
    if (row.platform === "ETSY") byPeriod[key].etsy += row.gross;
    if (row.platform === "TIKTOK") byPeriod[key].tiktok += row.gross;
    byPeriod[key].net += net;
  }

  return NextResponse.json({ interval, data: Object.values(byPeriod) });
}
