import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?error=etsy_denied`
    );
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("etsy_state")?.value;
  const verifier = cookieStore.get("etsy_code_verifier")?.value;

  if (!code || !state || state !== savedState || !verifier) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?error=etsy_invalid_state`
    );
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.ETSY_CLIENT_ID!,
      redirect_uri: process.env.ETSY_REDIRECT_URI!,
      code,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("Etsy token exchange failed:", body);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?error=etsy_token_failed`
    );
  }

  const token = await tokenRes.json();

  // Etsy returns user_id and api_key in the token response — store for later use
  const meta = JSON.stringify({
    user_id: token.user_id ?? null,
    api_key: token.api_key ?? null,
  });

  await prisma.platformAuth.upsert({
    where: { platform: "ETSY" },
    create: {
      platform: "ETSY",
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scope: meta,
    },
    update: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scope: meta,
    },
  });

  // Clear PKCE cookies
  cookieStore.delete("etsy_code_verifier");
  cookieStore.delete("etsy_state");

  return NextResponse.redirect(
    `${process.env.NEXTAUTH_URL}/settings?success=etsy_connected`
  );
}
