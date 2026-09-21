import { DASHBOARD_URL, REVIEWS_URL } from "@/routes/apiRoute";
import type {
  DashboardResponse,
  ReviewDetailResponse,
  ReviewsResponse,
} from "@/types/dashboard";

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (response.status === 401 && typeof window !== "undefined") {
    // Session cookie missing/expired mid-visit — bounce through GitHub
    // again rather than showing a raw fetch error.
    window.location.href = "/api/auth/github/login";
    return new Promise(() => {}); // navigation is happening; never resolve
  }

  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    throw new Error(error ?? `Request failed: ${response.status}`);
  }

  return payload as T;
}

export function getDashboard() {
  return apiFetch<DashboardResponse>(DASHBOARD_URL);
}

export function getReviews(page = 1) {
  return apiFetch<ReviewsResponse>(`${REVIEWS_URL}?page=${page}`);
}

export function getReview(reviewId: string) {
  return apiFetch<ReviewDetailResponse>(`${REVIEWS_URL}/${reviewId}`);
}