import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateCodeVerifier, generateCodeChallenge } from "@/lib/pkce";

// GET /api/auth/etsy — start OAuth flow
export async function GET() {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = crypto.randomUUID();

  const cookieStore = await cookies();
  cookieStore.set("etsy_code_verifier", verifier, { httpOnly: true, maxAge: 600 });
  cookieStore.set("etsy_state", state, { httpOnly: true, maxAge: 600 });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ETSY_CLIENT_ID!,
    redirect_uri: process.env.ETSY_REDIRECT_URI!,
    scope: "transactions_r listings_r shops_r",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return NextResponse.redirect(
    `https://www.etsy.com/oauth/connect?${params.toString()}`
  );
}
