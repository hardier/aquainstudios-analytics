import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getDateRange(range: string): { gte: Date } | undefined {
  const now = new Date();
  if (range === "7d") return { gte: new Date(now.getTime() - 7 * 86400000) };
  if (range === "30d") return { gte: new Date(now.getTime() - 30 * 86400000) };
  if (range === "90d") return { gte: new Date(now.getTime() - 90 * 86400000) };
  return undefined; // all time
}

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "30d";
  const placedAt = getDateRange(range);

  const whereOrders = {
    ...(placedAt ? { placedAt } : {}),
    status: { notIn: ["CANCELLED" as const, "REFUNDED" as const] },
  };

  // Total orders + gross revenue
  const ordersAgg = await prisma.order.aggregate({
    where: whereOrders,
    _count: { id: true },
    _sum: { totalUsd: true },
  });

  // Total fees
  const feesAgg = await prisma.fee.aggregate({
    where: { order: whereOrders },
    _sum: { amountUsd: true },
  });

  const grossRevenue = Number(ordersAgg._sum.totalUsd ?? 0);
  const totalFees = Number(feesAgg._sum.amountUsd ?? 0);
  const netRevenue = grossRevenue - totalFees;
  const orderCount = ordersAgg._count.id;
  const avgOrderValue = orderCount > 0 ? grossRevenue / orderCount : 0;

  // Refunds in period
  const refundAgg = await prisma.order.aggregate({
    where: {
      ...(placedAt ? { placedAt } : {}),
      status: { in: ["REFUNDED", "PARTIAL_REFUND"] },
    },
    _count: { id: true },
  });
  const refundRate =
    orderCount + refundAgg._count.id > 0
      ? refundAgg._count.id / (orderCount + refundAgg._count.id)
      : 0;

  // Platform breakdown
  const platformBreakdown = await prisma.order.groupBy({
    by: ["platform"],
    where: whereOrders,
    _count: { id: true },
    _sum: { totalUsd: true },
  });

  // Order status breakdown
  const statusBreakdown = await prisma.order.groupBy({
    by: ["status"],
    where: placedAt ? { placedAt } : {},
    _count: { id: true },
  });

  // Top products by net revenue (gross - fees not split per product, so use gross)
  const topProducts = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: whereOrders,
      isRefund: false,
    },
    _sum: { unitPriceUsd: true },
    _count: { id: true },
    orderBy: { _sum: { unitPriceUsd: "desc" } },
    take: 20,
  });

  // Enrich top products with titles
  const productIds = topProducts.map((p) => p.productId).filter(Boolean) as string[];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, title: true },
  });
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.title]));

  // Quantity sold per product
  const qtySold = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: whereOrders, isRefund: false, productId: { in: productIds } },
    _sum: { quantity: true },
  });
  const qtyMap = Object.fromEntries(
    qtySold.map((q) => [q.productId, Number(q._sum.quantity ?? 0)])
  );

  return NextResponse.json({
    range,
    kpis: {
      netRevenue: +netRevenue.toFixed(2),
      grossRevenue: +grossRevenue.toFixed(2),
      totalFees: +totalFees.toFixed(2),
      orderCount,
      avgOrderValue: +avgOrderValue.toFixed(2),
      refundRate: +refundRate.toFixed(4),
    },
    platformBreakdown: platformBreakdown.map((p) => ({
      platform: p.platform,
      orders: p._count.id,
      grossRevenue: +(Number(p._sum.totalUsd ?? 0).toFixed(2)),
    })),
    statusBreakdown: statusBreakdown.map((s) => ({
      status: s.status,
      count: s._count.id,
    })),
    topProducts: topProducts.map((p) => ({
      productId: p.productId,
      title: p.productId ? (productMap[p.productId] ?? "Unknown") : "Unknown",
      unitsSold: p.productId ? (qtyMap[p.productId] ?? 0) : 0,
      grossRevenue: +(Number(p._sum.unitPriceUsd ?? 0).toFixed(2)),
    })),
  });
}
