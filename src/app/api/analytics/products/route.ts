import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type ProductSortKey = "revenue" | "units" | "orders" | "avg_price";

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "30d";
  const sort = (req.nextUrl.searchParams.get("sort") ?? "revenue") as ProductSortKey;

  const now = new Date();
  const gte =
    range === "7d" ? new Date(now.getTime() - 7 * 86400000) :
    range === "30d" ? new Date(now.getTime() - 30 * 86400000) :
    range === "90d" ? new Date(now.getTime() - 90 * 86400000) :
    new Date(0);

  const orderByMap: Record<ProductSortKey, string> = {
    revenue: "gross DESC",
    units: "units DESC",
    orders: "order_count DESC",
    avg_price: "avg_price DESC",
  };

  // Group by product + variant, with order count and units
  const rows = await prisma.$queryRawUnsafe<{
    productId: string;
    title: string;
    variantLabel: string | null;
    platform: string;
    units: number;
    order_count: number;
    gross: number;
    avg_price: number;
  }[]>(`
    SELECT
      p.id AS "productId",
      p.title,
      oi."variantLabel",
      o.platform::text AS platform,
      SUM(oi.quantity)::int AS units,
      COUNT(DISTINCT oi."orderId")::int AS order_count,
      SUM(oi.quantity * oi."unitPriceUsd")::float AS gross,
      AVG(oi."unitPriceUsd")::float AS avg_price
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    JOIN products p ON p.id = oi."productId"
    WHERE o."placedAt" >= $1
      AND o.status NOT IN ('CANCELLED', 'REFUNDED')
      AND oi."isRefund" = false
    GROUP BY p.id, p.title, oi."variantLabel", o.platform
    ORDER BY ${orderByMap[sort]}
    LIMIT 50
  `, gte);

  return NextResponse.json({ sort, range, products: rows });
}
