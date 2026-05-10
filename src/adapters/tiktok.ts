import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { PlatformAdapter, NormalizedOrder } from "./types";
import type { OrderStatus } from ".prisma/client";

const TIKTOK_API = "https://open-api.tiktokglobalshop.com";

function sign(appSecret: string, path: string, params: Record<string, string>, body: string): string {
  const sortedParams = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  const input = `${appSecret}${path}${sortedParams}${body}${appSecret}`;
  return crypto.createHmac("sha256", appSecret).update(input).digest("hex");
}

function mapTikTokStatus(status: string): OrderStatus {
  const map: Record<string, OrderStatus> = {
    UNPAID: "PENDING",
    ON_HOLD: "PENDING",
    AWAITING_SHIPMENT: "PAID",
    AWAITING_COLLECTION: "PAID",
    IN_TRANSIT: "SHIPPED",
    DELIVERED: "SHIPPED",
    COMPLETED: "COMPLETE",
    CANCELLED: "CANCELLED",
    PARTIALLY_REFUNDED: "PARTIAL_REFUND",
    REFUNDED: "REFUNDED",
  };
  return map[status] ?? "PENDING";
}

interface TikTokOrder {
  id: string;
  status: string;
  buyer_email?: string;
  currency: string;
  payment_info: { total_amount: string };
  create_time: number;
  line_items: TikTokLineItem[];
  shipping_fee_amount?: string;
  platform_discount?: string;
}

interface TikTokLineItem {
  id: string;
  product_id: string;
  product_name: string;
  sku_id: string;
  quantity: number;
  sale_price: string;
  platform_discount?: string;
}

export class TikTokAdapter implements PlatformAdapter {
  platform = "TIKTOK" as const;

  private appKey = process.env.TIKTOK_APP_KEY!;
  private appSecret = process.env.TIKTOK_APP_SECRET!;

  private async getToken(): Promise<string> {
    const auth = await prisma.platformAuth.findUnique({ where: { platform: "TIKTOK" } });
    if (!auth) throw new Error("TikTok not connected");
    return auth.accessToken;
  }

  private async apiGet(path: string, params: Record<string, string>, token: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const allParams = { ...params, app_key: this.appKey, timestamp, access_token: token };
    const signature = sign(this.appSecret, path, allParams, "");
    const qs = new URLSearchParams({ ...allParams, sign: signature }).toString();
    const res = await fetch(`${TIKTOK_API}${path}?${qs}`);
    if (!res.ok) throw new Error(`TikTok API ${path} failed: ${res.status}`);
    return res.json();
  }

  async fetchAndStore(): Promise<string> {
    const token = await this.getToken();
    const allOrders: TikTokOrder[] = [];

    // TikTok paginates via cursor
    let cursor: string | undefined;
    while (true) {
      const params: Record<string, string> = { page_size: "100" };
      if (cursor) params.cursor = cursor;

      const data = await this.apiGet("/api/orders/search", params, token);
      const orders: TikTokOrder[] = data.data?.order_list ?? [];
      allOrders.push(...orders);

      if (!data.data?.next_cursor || orders.length < 100) break;
      cursor = data.data.next_cursor;
    }

    const raw = await prisma.rawImport.create({
      data: { platform: "TIKTOK", payload: allOrders as object, processed: false },
    });
    return raw.id;
  }

  async processRaw(rawImportId: string): Promise<NormalizedOrder[]> {
    const raw = await prisma.rawImport.findUniqueOrThrow({ where: { id: rawImportId } });
    const orders = raw.payload as unknown as TikTokOrder[];
    const normalized: NormalizedOrder[] = [];

    for (const o of orders) {
      const platformOrderId = o.id;
      const placedAt = new Date(o.create_time * 1000);
      const totalUsd = parseFloat(o.payment_info.total_amount);

      const order = await prisma.order.upsert({
        where: { platform_platformOrderId: { platform: "TIKTOK", platformOrderId } },
        create: {
          platform: "TIKTOK",
          platformOrderId,
          status: mapTikTokStatus(o.status),
          buyerEmail: o.buyer_email ?? null,
          currencyOriginal: o.currency,
          totalUsd,
          placedAt,
        },
        update: { status: mapTikTokStatus(o.status), totalUsd },
      });

      for (const item of o.line_items) {
        const product = await prisma.product.upsert({
          where: { id: `tiktok-${item.product_id}` },
          create: { id: `tiktok-${item.product_id}`, title: item.product_name },
          update: { title: item.product_name },
        });

        const listing = await prisma.platformListing.upsert({
          where: { platform_platformListingId: { platform: "TIKTOK", platformListingId: item.product_id } },
          create: {
            platform: "TIKTOK",
            platformListingId: item.product_id,
            productId: product.id,
            title: item.product_name,
            priceUsd: parseFloat(item.sale_price),
          },
          update: {
            title: item.product_name,
            priceUsd: parseFloat(item.sale_price),
          },
        });

        await prisma.orderItem.upsert({
          where: { id: `tiktok-${item.id}` },
          create: {
            id: `tiktok-${item.id}`,
            orderId: order.id,
            productId: product.id,
            platformListingId: listing.id,
            quantity: item.quantity,
            unitPriceUsd: parseFloat(item.sale_price),
            isRefund: false,
          },
          update: {
            quantity: item.quantity,
            unitPriceUsd: parseFloat(item.sale_price),
          },
        });
      }

      await prisma.fee.deleteMany({ where: { orderId: order.id } });
      const fees = [];
      if (o.shipping_fee_amount && parseFloat(o.shipping_fee_amount) !== 0) {
        fees.push({ orderId: order.id, feeType: "SHIPPING" as const, amountUsd: parseFloat(o.shipping_fee_amount), label: "TikTok shipping" });
      }
      if (o.platform_discount && parseFloat(o.platform_discount) !== 0) {
        fees.push({ orderId: order.id, feeType: "PLATFORM_COMMISSION" as const, amountUsd: parseFloat(o.platform_discount), label: "TikTok platform discount" });
      }
      if (fees.length > 0) await prisma.fee.createMany({ data: fees });

      normalized.push({
        platform: "TIKTOK",
        platformOrderId,
        status: mapTikTokStatus(o.status),
        currencyOriginal: o.currency,
        totalUsd,
        placedAt,
        items: o.line_items.map((item) => ({
          platformListingId: item.product_id,
          quantity: item.quantity,
          unitPriceUsd: parseFloat(item.sale_price),
          isRefund: false,
        })),
        fees,
      });
    }

    await prisma.rawImport.update({ where: { id: rawImportId }, data: { processed: true } });
    return normalized;
  }
}
