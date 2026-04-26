import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

function withMobileSource(redirectUri: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("source", "mobile");
  return url.toString();
}

export async function GET(request: NextRequest) {
  const label = request.nextUrl.searchParams.get("label") ?? "";
  const isMobile = request.nextUrl.searchParams.get("source") === "mobile";
  const redirectUri = isMobile
    ? withMobileSource(process.env.GHL_REDIRECT_URI!)
    : process.env.GHL_REDIRECT_URI!;

  const state = randomBytes(16).toString("hex");
  const statePayload = JSON.stringify({
    state,
    label: label.trim(),
    source: isMobile ? "mobile" : "web",
    redirectUri,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.GHL_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope:
      "contacts.readonly contacts.write conversations.write locations.readonly",
    state,
  });

  const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?${params}`;

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("ghl_oauth_state", statePayload, {
    httpOnly: true,
    maxAge: 600,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
