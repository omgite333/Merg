import { App } from "@octokit/app";
import fs from "fs";
import "dotenv/config";

const privateKey = fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH!, "utf8");

export const githubApp = new App({
  appId: process.env.GITHUB_APP_ID!,
  privateKey,
});

export async function getInstallationOctokit(installationId: number) {
  return githubApp.getInstallationOctokit(installationId);
}