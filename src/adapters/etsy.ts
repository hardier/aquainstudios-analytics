import { prisma } from "@/lib/prisma";
import type { PlatformAdapter, NormalizedOrder } from "./types";
type OrderStatus = "PENDING" | "PAID" | "SHIPPED" | "COMPLETE" | "CANCELLED" | "REFUNDED" | "PARTIAL_REFUND";
type FeeType = "TRANSACTION" | "LISTING" | "PAYMENT_PROCESSING" | "SHIPPING" | "TAX" | "PLATFORM_COMMISSION" | "OTHER";

const ETSY_API = "https://openapi.etsy.com/v3";

// Maps Etsy receipt status → canonical OrderStatus
function mapEtsyStatus(receipt: EtsyReceipt): OrderStatus {
  if (receipt.status === "canceled") return "CANCELLED";
  if (receipt.is_paid === false) return "PENDING";
  if (receipt.is_shipped === false) return "PAID";
  if (receipt.shipments?.some((s: EtsyShipment) => s.tracking_code)) return "SHIPPED";
  return "COMPLETE";
}

interface EtsyShipment {
  tracking_code?: string;
}

interface EtsyReceipt {
  receipt_id: number;
  status: string;
  is_paid: boolean;
  is_shipped: boolean;
  buyer_email: string;
  grandtotal: { amount: number; divisor: number; currency_code: string };
  total_price: { amount: number; divisor: number; currency_code: string };
  total_shipping_cost: { amount: number; divisor: number; currency_code: string };
  total_tax_cost: { amount: number; divisor: number; currency_code: string };
  seller_fee?: { amount: number; divisor: number; currency_code: string };
  create_timestamp: number;
  transactions: EtsyTransaction[];
  shipments?: EtsyShipment[];
}

interface EtsyTransaction {
  transaction_id: number;
  listing_id: number;
  title: string;
  quantity: number;
  price: { amount: number; divisor: number; currency_code: string };
  product_data?: { property_values?: { property_name: string; values: string[] }[] };
}

function toUsd(amount: number, divisor: number): number {
  return amount / divisor;
}

export class EtsyAdapter implements PlatformAdapter {
  platform = "ETSY" as const;

  private async getAuth(): Promise<{ token: string; shopId: number }> {
    const auth = await prisma.platformAuth.findUnique({ where: { platform: "ETSY" } });
    if (!auth) throw new Error("Etsy not connected");

    // Access token format is "{user_id}.{token}" — extract user_id directly
    const userId = auth.accessToken.split(".")[0];
    if (!userId || isNaN(Number(userId))) throw new Error("Could not extract user_id from Etsy access token");

    const shopRes = await fetch(`${ETSY_API}/application/users/${userId}/shops`, {
      headers: this.etsyHeaders(auth.accessToken),
    });
    if (!shopRes.ok) {
      const body = await shopRes.text();
      throw new Error(`Etsy shop fetch failed: ${shopRes.status} — ${body}`);
    }
    const shop = await shopRes.json();
    const shopId = shop.shop_id;
    if (!shopId) throw new Error("No shop found for this Etsy account");
    return { token: auth.accessToken, shopId };
  }

  private etsyHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      "x-api-key": `${process.env.ETSY_CLIENT_ID!}:${process.env.ETSY_CLIENT_SECRET!}`,
    };
  }

  async fetchAndStore(): Promise<string> {
    const { token, shopId } = await this.getAuth();

    const allReceipts: EtsyReceipt[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const res = await fetch(
        `${ETSY_API}/application/shops/${shopId}/receipts?limit=${limit}&offset=${offset}&was_paid=true`,
        { headers: this.etsyHeaders(token) }
      );
      if (!res.ok) throw new Error(`Etsy receipts fetch failed: ${res.status}`);
      const data = await res.json();
      allReceipts.push(...data.results);
      if (data.results.length < limit) break;
      offset += limit;
    }

    const raw = await prisma.rawImport.create({
      data: { platform: "ETSY", payload: allReceipts as object, processed: false },
    });

    return raw.id;
  }

  async processRaw(rawImportId: string): Promise<NormalizedOrder[]> {
    const raw = await prisma.rawImport.findUniqueOrThrow({ where: { id: rawImportId } });
    const receipts = raw.payload as unknown as EtsyReceipt[];
    const normalized: NormalizedOrder[] = [];

    for (const receipt of receipts) {
      const platformOrderId = receipt.receipt_id.toString();
      const placedAt = new Date(receipt.create_timestamp * 1000);
      const currencyOriginal = receipt.grandtotal.currency_code;
      const totalUsd = toUsd(receipt.grandtotal.amount, receipt.grandtotal.divisor);

      // Upsert order
      const order = await prisma.order.upsert({
        where: { platform_platformOrderId: { platform: "ETSY", platformOrderId } },
        create: {
          platform: "ETSY",
          platformOrderId,
          status: mapEtsyStatus(receipt),
          buyerEmail: receipt.buyer_email ?? null,
          currencyOriginal,
          totalUsd,
          placedAt,
        },
        update: {
          status: mapEtsyStatus(receipt),
          totalUsd,
        },
      });

      // Upsert each transaction as an order item
      for (const tx of receipt.transactions) {
        const listingId = tx.listing_id.toString();

        // Ensure product exists
        const product = await prisma.product.upsert({
          where: { id: `etsy-${tx.listing_id}` },
          create: { id: `etsy-${tx.listing_id}`, title: tx.title },
          update: { title: tx.title },
        });

        // Ensure platform listing exists
        const listing = await prisma.platformListing.upsert({
          where: { platform_platformListingId: { platform: "ETSY", platformListingId: listingId } },
          create: {
            platform: "ETSY",
            platformListingId: listingId,
            productId: product.id,
            title: tx.title,
            priceUsd: toUsd(tx.price.amount, tx.price.divisor),
          },
          update: {
            title: tx.title,
            priceUsd: toUsd(tx.price.amount, tx.price.divisor),
          },
        });

        await prisma.orderItem.upsert({
          where: { id: `etsy-${tx.transaction_id}` },
          create: {
            id: `etsy-${tx.transaction_id}`,
            orderId: order.id,
            productId: product.id,
            platformListingId: listing.id,
            quantity: tx.quantity,
            unitPriceUsd: toUsd(tx.price.amount, tx.price.divisor),
            isRefund: false,
          },
          update: {
            quantity: tx.quantity,
            unitPriceUsd: toUsd(tx.price.amount, tx.price.divisor),
          },
        });
      }

      // Upsert fees: shipping + tax
      const feesToUpsert: { type: FeeType; amount: number; label: string }[] = [
        { type: "SHIPPING", amount: toUsd(receipt.total_shipping_cost.amount, receipt.total_shipping_cost.divisor), label: "Etsy shipping" },
        { type: "TAX", amount: toUsd(receipt.total_tax_cost.amount, receipt.total_tax_cost.divisor), label: "Etsy tax" },
      ];
      if (receipt.seller_fee) {
        feesToUpsert.push({ type: "TRANSACTION", amount: toUsd(receipt.seller_fee.amount, receipt.seller_fee.divisor), label: "Etsy seller fee" });
      }

      // Delete + recreate fees for this order (simpler than per-row upsert)
      await prisma.fee.deleteMany({ where: { orderId: order.id } });
      await prisma.fee.createMany({
        data: feesToUpsert
          .filter((f) => f.amount !== 0)
          .map((f) => ({ orderId: order.id, feeType: f.type, amountUsd: f.amount, label: f.label })),
      });

      normalized.push({
        platform: "ETSY",
        platformOrderId,
        status: mapEtsyStatus(receipt),
        buyerEmail: receipt.buyer_email,
        currencyOriginal,
        totalUsd,
        placedAt,
        items: receipt.transactions.map((tx) => ({
          platformListingId: tx.listing_id.toString(),
          quantity: tx.quantity,
          unitPriceUsd: toUsd(tx.price.amount, tx.price.divisor),
          isRefund: false,
        })),
        fees: feesToUpsert.map((f) => ({ feeType: f.type, amountUsd: f.amount, label: f.label })),
      });
    }

    await prisma.rawImport.update({ where: { id: rawImportId }, data: { processed: true } });
    return normalized;
  }
}
