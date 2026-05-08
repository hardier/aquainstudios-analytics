import { NextResponse } from "next/server";
import { EtsyAdapter } from "@/adapters/etsy";

export async function POST() {
  try {
    const adapter = new EtsyAdapter();
    const rawId = await adapter.fetchAndStore();
    const orders = await adapter.processRaw(rawId);
    return NextResponse.json({ ok: true, ordersProcessed: orders.length });
  } catch (err) {
    console.error("Etsy sync error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
