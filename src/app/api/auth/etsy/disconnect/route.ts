import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  await prisma.platformAuth.deleteMany({ where: { platform: "ETSY" } });
  return NextResponse.json({ ok: true });
}
