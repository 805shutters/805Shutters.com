#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const PROJECT = "805";
const VERIFY_URL = "https://www.805shutters.com";
const WAIT_MS = 10_000;
const MAX_WAIT_MS = 10 * 60_000;

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });

  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
    }
    process.exit(result.status || 1);
  }

  return options.capture ? result.stdout : "";
}

function parseJsonOutput(output) {
  const start = output.indexOf("{");
  if (start === -1) throw new Error(`No JSON object found in command output:\n${output}`);
  return JSON.parse(output.slice(start));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireMainBranch() {
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true }).trim();
  if (branch !== "main") {
    console.error(`Refusing to deploy from '${branch}'. Switch to main first.`);
    process.exit(1);
  }
}

function requireNoTrackedChanges() {
  const status = run("git", ["status", "--porcelain", "--untracked-files=no"], { capture: true }).trim();
  if (status) {
    console.error("Tracked changes are not committed. Commit them before deploying:");
    console.error(status);
    process.exit(1);
  }
}

function currentSha() {
  return run("git", ["rev-parse", "HEAD"], { capture: true }).trim();
}

async function waitForVercelDeployment(sha) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    const output = run(
      "npx",
      [
        "--yes",
        "vercel@latest",
        "list",
        PROJECT,
        "--format",
        "json",
        "--meta",
        `githubCommitSha=${sha}`,
        "--status",
        "BUILDING,READY,ERROR"
      ],
      { capture: true }
    );
    const payload = parseJsonOutput(output);
    const deployment = (payload.deployments || []).find((item) => item.target === "production");

    if (deployment?.state === "READY") return deployment;
    if (deployment?.state === "ERROR") {
      console.error(`Vercel deployment failed for ${sha}.`);
      process.exit(1);
    }

    console.log("Waiting for Vercel production deployment...");
    await sleep(WAIT_MS);
  }

  console.error(`Timed out waiting for Vercel deployment for ${sha}.`);
  process.exit(1);
}

function verifyWebsite() {
  const html = run("curl", ["-fsSL", VERIFY_URL], { capture: true });
  if (!html.includes("__next") || !html.includes("805 Shutters")) {
    console.error(`${VERIFY_URL} did not look like the expected Next.js site.`);
    process.exit(1);
  }
}

requireMainBranch();
requireNoTrackedChanges();

const sha = currentSha();
run("npm", ["run", "typecheck"]);
run("npm", ["test"]);
run("npm", ["run", "build"]);
run("git", ["push", "origin", "main"]);

const deployment = await waitForVercelDeployment(sha);
verifyWebsite();

console.log("");
console.log("Vercel deployment verified.");
console.log(`Commit: ${sha}`);
console.log(`Deployment: https://${deployment.url}`);
console.log(`Website URL: ${VERIFY_URL}`);
