export type Platform = "ETSY" | "TIKTOK" | "CSV";
export type OrderStatus = "PENDING" | "PAID" | "SHIPPED" | "COMPLETE" | "CANCELLED" | "REFUNDED" | "PARTIAL_REFUND";

export interface NormalizedOrder {
  platform: Platform;
  platformOrderId: string;
  status: OrderStatus;
  buyerEmail?: string;
  currencyOriginal: string;
  totalUsd: number | string;
  placedAt: Date;
  items: NormalizedOrderItem[];
  fees: NormalizedFee[];
}

export interface NormalizedOrderItem {
  platformListingId?: string;
  quantity: number;
  unitPriceUsd: number | string;
  isRefund: boolean;
}

export interface NormalizedFee {
  feeType: string;
  amountUsd: number | string;
  label?: string;
}

export interface PlatformAdapter {
  platform: Platform;
  fetchAndStore(): Promise<string>;
  processRaw(rawImportId: string): Promise<NormalizedOrder[]>;
}
