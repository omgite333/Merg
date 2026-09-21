import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@repo/database";
import {
  exchangeCodeForToken,
  fetchGithubUser,
  fetchUserInstallations,
} from "@/lib/github-oauth";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=missing_code", request.url));
  }

  // Only enforced when we set it ourselves (the "log in" flow). The
  // install+authorize flow triggered straight from GitHub's install page
  // won't have one, and that's expected.
  const expectedState = request.cookies.get("gh_oauth_state")?.value;
  if (expectedState && state !== expectedState) {
    return NextResponse.redirect(new URL("/?auth_error=state_mismatch", request.url));
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const [githubUser, installations] = await Promise.all([
      fetchGithubUser(accessToken),
      fetchUserInstallations(accessToken),
    ]);

    const user = await prisma.user.upsert({
      where: { githubUserId: githubUser.id },
      update: { login: githubUser.login, avatarUrl: githubUser.avatar_url },
      create: {
        githubUserId: githubUser.id,
        login: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      },
    });

    // Link every installation GitHub says this user can access. Most of
    // these already exist (created by the webhook when the app was
    // installed) — `upsert` just covers the rare race where the callback
    // lands before that webhook has been processed.
    for (const installation of installations) {
      await prisma.installation.upsert({
        where: { githubInstallId: installation.id },
        update: { users: { connect: { id: user.id } } },
        create: {
          githubInstallId: installation.id,
          account: installation.account?.login ?? "unknown",
          users: { connect: { id: user.id } },
        },
      });
    }

    const token = signSession({ userId: user.id, login: user.login });
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    response.cookies.delete("gh_oauth_state");
    return response;
  } catch (error) {
    console.error("GitHub OAuth callback failed:", error);
    return NextResponse.redirect(new URL("/?auth_error=oauth_failed", request.url));
  }
}