import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "30d";

  const now = new Date();
  const gte =
    range === "7d" ? new Date(now.getTime() - 7 * 86400000) :
    range === "30d" ? new Date(now.getTime() - 30 * 86400000) :
    range === "90d" ? new Date(now.getTime() - 90 * 86400000) :
    new Date(0);

  const interval = range === "all" || range === "90d" ? "week" : "day";

  const rows = await prisma.$queryRawUnsafe<{
    period: Date;
    productId: string;
    title: string;
    variantLabel: string | null;
    platform: string;
    units: number;
    gross: number;
  }[]>(`
    SELECT
      date_trunc('${interval}', o."placedAt") AS period,
      p.id AS "productId",
      p.title,
      oi."variantLabel",
      o.platform::text AS platform,
      SUM(oi.quantity)::int AS units,
      SUM(oi.quantity * oi."unitPriceUsd")::float AS gross
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    JOIN products p ON p.id = oi."productId"
    WHERE o."placedAt" >= $1
      AND o.status NOT IN ('CANCELLED', 'REFUNDED')
      AND oi."isRefund" = false
    GROUP BY period, p.id, p.title, oi."variantLabel", o.platform
    ORDER BY period DESC, gross DESC
    LIMIT 200
  `, gte);

  return NextResponse.json({
    interval,
    range,
    rows: rows.map((r) => ({
      ...r,
      period: new Date(r.period).toISOString(),
    })),
  });
}
