import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [etsy, tiktok] = await Promise.all([
    prisma.platformAuth.findUnique({ where: { platform: "ETSY" } }),
    prisma.platformAuth.findUnique({ where: { platform: "TIKTOK" } }),
  ]);

  const lastEtsyImport = await prisma.rawImport.findFirst({
    where: { platform: "ETSY" },
    orderBy: { importedAt: "desc" },
    select: { importedAt: true },
  });

  const lastTiktokImport = await prisma.rawImport.findFirst({
    where: { platform: "TIKTOK" },
    orderBy: { importedAt: "desc" },
    select: { importedAt: true },
  });

  return NextResponse.json({
    etsy: { connected: !!etsy, lastSynced: lastEtsyImport?.importedAt ?? null },
    tiktok: { connected: !!tiktok, lastSynced: lastTiktokImport?.importedAt ?? null },
  });
}
