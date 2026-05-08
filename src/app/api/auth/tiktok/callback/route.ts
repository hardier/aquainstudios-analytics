import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("tiktok_state")?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?error=tiktok_invalid_state`
    );
  }

  // TikTok token exchange requires HMAC-SHA256 signature
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const appKey = process.env.TIKTOK_APP_KEY!;
  const appSecret = process.env.TIKTOK_APP_SECRET!;

  const signStr = `${appSecret}app_key${appKey}auth_code${code}grant_type${"authorized_code"}timestamp${timestamp}${appSecret}`;
  const sign = crypto.createHmac("sha256", appSecret).update(signStr).digest("hex");

  const tokenRes = await fetch("https://auth.tiktok-shops.com/api/v2/token/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_key: appKey,
      app_secret: appSecret,
      auth_code: code,
      grant_type: "authorized_code",
      timestamp,
      sign,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("TikTok token exchange failed:", body);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?error=tiktok_token_failed`
    );
  }

  const data = await tokenRes.json();
  const token = data.data;

  await prisma.platformAuth.upsert({
    where: { platform: "TIKTOK" },
    create: {
      platform: "TIKTOK",
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.access_token_expire_in
        ? new Date(token.access_token_expire_in * 1000)
        : null,
      scope: null,
    },
    update: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.access_token_expire_in
        ? new Date(token.access_token_expire_in * 1000)
        : null,
    },
  });

  cookieStore.delete("tiktok_state");

  return NextResponse.redirect(
    `${process.env.NEXTAUTH_URL}/settings?success=tiktok_connected`
  );
}
