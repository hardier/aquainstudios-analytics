import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  await prisma.platformAuth.deleteMany({ where: { platform: "TIKTOK" } });
  return NextResponse.json({ ok: true });
}
