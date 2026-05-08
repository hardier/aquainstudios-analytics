import type { Platform, OrderStatus } from "@prisma/client";

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
  /** Fetch and persist raw data; returns the raw_import id */
  fetchAndStore(): Promise<string>;
  /** Transform stored raw rows into canonical schema */
  processRaw(rawImportId: string): Promise<NormalizedOrder[]>;
}
