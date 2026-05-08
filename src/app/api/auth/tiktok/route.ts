import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("tiktok_state", state, { httpOnly: true, maxAge: 600 });

  const params = new URLSearchParams({
    app_key: process.env.TIKTOK_APP_KEY!,
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    state,
  });

  return NextResponse.redirect(
    `https://auth.tiktok-shops.com/oauth/authorize?${params.toString()}`
  );
}
