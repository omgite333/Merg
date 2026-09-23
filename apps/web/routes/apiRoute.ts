// Relative on purpose: requests go to the Next.js origin (localhost:3000)
// and next.config.ts rewrites them server-side to the Express API. That
// keeps them same-origin from the browser's point of view, so the
// httpOnly session cookie is sent automatically — no CORS/credentials
// dance required. Don't point this at the backend's own origin directly.
export const API_URL = "/api";

export const DASHBOARD_URL = API_URL + "/dashboard";
export const REVIEWS_URL = API_URL + "/reviews";
export const CI_RUNS_URL = API_URL + "/ci-runs";
export const CI_RUNS_STATS_URL = API_URL + "/ci-runs/stats";

export const GITHUB_APP_INSTALL_URL =
  process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL ??
  "https://github.com/apps/mergercode/installations/select_target";