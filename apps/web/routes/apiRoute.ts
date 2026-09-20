const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const API_URL = `${API_BASE}/api`;

export const DASHBOARD_URL = API_URL + "/dashboard";
export const REVIEWS_URL = API_URL + "/reviews";

export const GITHUB_APP_INSTALL_URL =
  process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL ??
  "https://github.com/apps/mergercode/installations/select_target";