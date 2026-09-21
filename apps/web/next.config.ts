import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Proxies browser calls to /api/dashboard, /api/reviews, etc. through to
  // the Express server so the browser sees them as same-origin as
  // localhost:3000. That's what lets the httpOnly session cookie (set by
  // the OAuth callback route, also on :3000) reach the backend without
  // fiddling with SameSite=None/cross-site cookie rules.
  // Next's own route handlers under app/api/auth/** are matched first and
  // are never touched by this rewrite.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;