import { App } from "@octokit/app";
import fs from "fs";
import { env } from "./env";

const privateKey = fs.readFileSync(env.GITHUB_PRIVATE_KEY_PATH, "utf8");

export const githubApp = new App({
  appId: env.GITHUB_APP_ID,
  privateKey,
});

export async function getInstallationOctokit(installationId: number) {
  return githubApp.getInstallationOctokit(installationId);
}