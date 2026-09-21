function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Same callback URL is used for both "login" and "install + authorize" —
// GitHub sends the user here either way, with different query params.
export function getCallbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/auth/github/callback`;
}

export function getAuthorizeUrl(state: string): string {
  const clientId = requireEnv("GITHUB_CLIENT_ID");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(),
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

type TokenResponse = { access_token: string; error?: string; error_description?: string };

export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: requireEnv("GITHUB_CLIENT_ID"),
      client_secret: requireEnv("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: getCallbackUrl(),
    }),
  });

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error(data.error_description ?? "GitHub did not return an access token");
  }
  return data.access_token;
}

export type GithubUser = { id: number; login: string; avatar_url: string };

export async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error("Failed to fetch GitHub user profile");
  return response.json();
}

export type GithubInstallation = { id: number; account: { login: string } | null };

// Installations of THIS app that the logged-in user can access — either
// because they installed it themselves, or an org admin installed it and
// they're a member with access. This is what scopes the dashboard.
export async function fetchUserInstallations(accessToken: string): Promise<GithubInstallation[]> {
  const installations: GithubInstallation[] = [];
  let page = 1;

  for (;;) {
    const response = await fetch(
      `https://api.github.com/user/installations?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" } }
    );
    if (!response.ok) throw new Error("Failed to fetch GitHub installations");

    const data = (await response.json()) as { installations: GithubInstallation[] };
    installations.push(...data.installations);

    if (data.installations.length < 100) break;
    page += 1;
  }

  return installations;
}