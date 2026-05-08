import { NextResponse } from "next/server";
import { TikTokAdapter } from "@/adapters/tiktok";

export async function POST() {
  try {
    const adapter = new TikTokAdapter();
    const rawId = await adapter.fetchAndStore();
    const orders = await adapter.processRaw(rawId);
    return NextResponse.json({ ok: true, ordersProcessed: orders.length });
  } catch (err) {
    console.error("TikTok sync error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
