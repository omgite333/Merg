import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthorizeUrl } from "@/lib/github-oauth";

// CSRF guard: random value we hand to GitHub and check for on the way back.
export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(getAuthorizeUrl(state));

  response.cookies.set("gh_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}