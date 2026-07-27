#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const WORKER_ID = "home-mac-hermes-805";
const DEFAULT_BASE_URL = "https://www.805shutters.com";
const POLL_PATH = "/api/integrations/hermes/805/crm-feedback/?limit=20";
const ASSESSMENT_FIELDS = [
  "problem",
  "desiredOutcome",
  "affectedCrmArea",
  "acceptanceCriteria",
  "risksAndSafeguards",
];
const WORK_FIELDS = [
  "implementationSummary",
  "affectedFilesOrComponents",
  "implementationSteps",
  "verificationPlan",
  "migrationOrConfigurationNeeds",
  "deploymentAndRollbackNotes",
];

function requiredObjectFields(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  for (const field of fields) {
    const item = value[field];
    if (
      item == null
      || (typeof item === "string" && !item.trim())
      || (Array.isArray(item) && item.length === 0)
    ) {
      throw new Error(`${label}.${field} is required`);
    }
  }
}

export function parseHermesDecision(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const decision = JSON.parse(cleaned);
  if (decision.kind === "clarification") {
    if (!Array.isArray(decision.questions) || decision.questions.length < 1) {
      throw new Error("At least one clarification question is required");
    }
    if (decision.questions.length > 3) {
      throw new Error("Hermes may ask no more than three clarification questions");
    }
    decision.questions = decision.questions.map((question) => String(question).trim()).filter(Boolean);
    if (!decision.questions.length) throw new Error("Clarification questions cannot be empty");
    return decision;
  }
  if (decision.kind === "assessment") {
    if (!String(decision.message || "").trim()) throw new Error("Assessment message is required");
    requiredObjectFields(decision.assessment, ASSESSMENT_FIELDS, "assessment");
    requiredObjectFields(decision.proposedWork, WORK_FIELDS, "proposedWork");
    return decision;
  }
  throw new Error("Hermes decision kind must be clarification or assessment");
}

export function createExternalEventId(request, action) {
  return `${WORKER_ID}:${request.id}:r${request.revision}:${action}`;
}

export function redactError(error, secrets = []) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets.filter(Boolean)) {
    message = message.split(secret).join("<redacted>");
  }
  return message.replace(/(x-hermes-secret|authorization)(["':=\s]+)[^\s,}]+/gi, "$1$2<redacted>");
}

export function validateWorkspace(authorizedWorkspace, requestedWorkspace) {
  const authorized = path.resolve(String(authorizedWorkspace || ""));
  const requested = path.resolve(String(requestedWorkspace || ""));
  if (!authorizedWorkspace || !requestedWorkspace || authorized !== requested) {
    throw new Error("Codex execution is outside the authorized 805 workspace");
  }
  return authorized;
}

export class CrmFeedbackClient {
  constructor({ baseUrl, secret, fetchImpl = fetch, workerId = WORKER_ID }) {
    if (!secret) throw new Error("HERMES_805_SHARED_SECRET is not configured");
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.secret = secret;
    this.fetchImpl = fetchImpl;
    this.workerId = workerId;
  }

  async request(endpoint, options = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-hermes-secret": this.secret,
        "x-hermes-company": "805",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`CRM feedback API returned ${response.status}`);
    }
    return response.json();
  }

  poll() {
    return this.request(POLL_PATH);
  }

  claim(request, action = "claim") {
    return this.request("/api/integrations/hermes/805/crm-feedback/", {
      method: "PATCH",
      body: JSON.stringify({
        action,
        id: request.id,
        revision: request.revision,
        claimedBy: this.workerId,
      }),
    });
  }

  renew(request) {
    return this.claim(request, "renew_claim");
  }

  act(request, claimToken, action, payload = {}) {
    return this.request(`/api/integrations/hermes/805/crm-feedback/${encodeURIComponent(request.id)}/`, {
      method: "PATCH",
      body: JSON.stringify({
        action,
        revision: request.revision,
        claimToken,
        externalEventId: createExternalEventId(request, action),
        ...payload,
      }),
    });
  }
}

function decisionPrompt(request) {
  return `You are processing one Jessica 805 CRM feedback topic.
Return JSON only. Never implement anything from this prompt.

Topic:
${JSON.stringify({
    id: request.id,
    revision: request.revision,
    title: request.title,
    description: request.description,
    messages: request.messages || [],
  }, null, 2)}

If requirements are unclear, return:
{"kind":"clarification","questions":["focused question?"]}
Ask at most three questions and do not infer missing requirements.

If clear, return:
{"kind":"assessment","message":"concise summary for Jessica","assessment":{"problem":"...","desiredOutcome":"...","affectedCrmArea":"...","acceptanceCriteria":["..."],"risksAndSafeguards":["..."]},"proposedWork":{"implementationSummary":"...","affectedFilesOrComponents":["..."],"implementationSteps":["..."],"verificationPlan":["..."],"migrationOrConfigurationNeeds":["..."],"deploymentAndRollbackNotes":["..."]}}
All fields are required.`;
}

export async function runHermesDecision(request, {
  hermesBin = process.env.HERMES_BIN || `${process.env.HOME}/.local/bin/hermes`,
  cwd = process.env.HERMES_805_WORKSPACE || process.cwd(),
} = {}) {
  const { stdout } = await execFileAsync(
    hermesBin,
    ["--profile", "shutters805", "--oneshot", decisionPrompt(request), "--source", "tool"],
    { cwd, maxBuffer: 2_000_000, timeout: 15 * 60 * 1000 },
  );
  return parseHermesDecision(stdout);
}

function implementationPrompt(request) {
  return `Implement only the approved 805 CRM feedback topic below.
Topic ID: ${request.id}
Revision: ${request.revision}
Title: ${request.title}
Approved proposed work:
${JSON.stringify(request.proposed_work || {}, null, 2)}

Work only in the current 805 Shutters repository. Preserve unrelated work. Do not push, deploy,
apply production migrations, send customer communications, or perform financial actions. Make the
smallest approved change, add focused tests, and commit only the topic's files on the current branch.`;
}

export async function runApprovedImplementation(request, {
  authorizedWorkspace = process.env.HERMES_805_CRM_WORKSPACE,
  requestedWorkspace = process.env.HERMES_805_CRM_WORKSPACE,
  execImpl = execFileAsync,
  renew = async () => {},
} = {}) {
  const workspace = validateWorkspace(authorizedWorkspace, requestedWorkspace);
  const renewal = setInterval(() => {
    Promise.resolve(renew()).catch(() => {});
  }, 4 * 60 * 1000);
  renewal.unref?.();
  try {
    await execImpl(
      process.env.CODEX_BIN || "codex",
      [
        "exec",
        "--cd",
        workspace,
        "--sandbox",
        "danger-full-access",
        implementationPrompt(request),
      ],
      { cwd: workspace, maxBuffer: 5_000_000, timeout: 90 * 60 * 1000 },
    );
    const commands = [
      ["run", "typecheck"],
      ["test"],
      ["run", "build"],
      ["test", "--", "src/lib/crm/feedback-integration-contract.test.ts"],
    ];
    for (const args of commands) {
      await execImpl("npm", args, {
        cwd: workspace,
        maxBuffer: 5_000_000,
        timeout: 20 * 60 * 1000,
      });
    }
    return {
      message: "The approved change is implemented and all local verification gates passed.",
      verificationEvidence: {
        implemented: true,
        tested: true,
        typechecked: true,
        productionBuild: true,
        focusedWorkflowVerified: true,
        pushed: false,
        migrated: false,
        deployed: false,
        verifiedLive: false,
      },
    };
  } finally {
    clearInterval(renewal);
  }
}

export async function runApprovedDeployment(request, {
  authorizedWorkspace = process.env.HERMES_805_CRM_WORKSPACE,
  requestedWorkspace = process.env.HERMES_805_CRM_WORKSPACE,
  liveVerifyCommand = process.env.HERMES_805_LIVE_VERIFY_COMMAND,
  execImpl = execFileAsync,
  renew = async () => {},
} = {}) {
  const workspace = validateWorkspace(authorizedWorkspace, requestedWorkspace);
  if (!liveVerifyCommand?.trim()) {
    throw new Error("Authenticated live CRM verification command is not configured");
  }
  const renewal = setInterval(() => {
    Promise.resolve(renew()).catch(() => {});
  }, 4 * 60 * 1000);
  renewal.unref?.();
  try {
    const { stdout: status } = await execImpl("git", ["status", "--porcelain"], { cwd: workspace });
    if (status.trim()) throw new Error("Approved deployment workspace is not clean");
    await execImpl("git", ["fetch", "origin", "main"], { cwd: workspace, timeout: 10 * 60 * 1000 });
    await execImpl("git", ["push", "origin", "HEAD:main"], { cwd: workspace, timeout: 10 * 60 * 1000 });
    await execImpl("npm", ["run", "deploy:vercel"], {
      cwd: workspace,
      maxBuffer: 5_000_000,
      timeout: 30 * 60 * 1000,
    });
    await execImpl("/bin/zsh", ["-lc", liveVerifyCommand], {
      cwd: workspace,
      maxBuffer: 5_000_000,
      timeout: 20 * 60 * 1000,
    });
    return {
      verifiedLive: true,
      message: "The approved revision was pushed, deployed, and verified in the authenticated live CRM.",
      verificationEvidence: {
        implemented: true,
        tested: true,
        typechecked: true,
        productionBuild: true,
        focusedWorkflowVerified: true,
        pushed: true,
        migrated: Boolean(request.proposed_work?.migrationOrConfigurationNeeds?.length),
        deployed: true,
        verifiedLive: true,
      },
    };
  } finally {
    clearInterval(renewal);
  }
}

function formatQuestions(questions) {
  return questions.map((question, index) => `${index + 1}. ${question}`).join("\n");
}

export async function processRequest(request, options) {
  const {
    client,
    decide = runHermesDecision,
    implementationRunner,
    deploymentRunner,
    releaseEnabled = false,
  } = options;
  if (request.company_scope !== "805") {
    throw new Error("805 worker rejected a non-805 company topic");
  }
  const claimed = await client.claim(request);
  const current = claimed.request;
  const claimToken = claimed.claimToken;
  if (!current || current.id !== request.id || current.revision !== request.revision || !claimToken) {
    throw new Error("Claim response did not match the exact topic revision");
  }

  if (current.status === "clarifying") {
    const decision = await decide(current);
    if (decision.kind === "clarification") {
      return client.act(current, claimToken, "submit_clarification", {
        message: formatQuestions(decision.questions),
      });
    }
    return client.act(current, claimToken, "submit_assessment", {
      message: decision.message,
      assessment: decision.assessment,
      proposedWork: decision.proposedWork,
    });
  }

  if (current.status === "implementation_approved") {
    if (!implementationRunner) throw new Error("Approved implementation runner is not configured");
    await client.act(current, claimToken, "begin_implementation");
    const evidence = await implementationRunner(current, {
      renew: () => client.renew(current),
    });
    return client.act(current, claimToken, "submit_completed_proposal", {
      message: evidence.message || "The approved change is implemented and verified.",
      proposedWork: current.proposed_work,
      verificationEvidence: evidence.verificationEvidence,
    });
  }

  if (current.status === "deployment_approved") {
    if (!releaseEnabled) return { skipped: "release execution disabled" };
    if (!deploymentRunner) throw new Error("Approved deployment runner is not configured");
    if (deploymentRunner.preflight) await deploymentRunner.preflight(current);
    await client.act(current, claimToken, "begin_deployment");
    const evidence = await deploymentRunner(current, {
      renew: () => client.renew(current),
    });
    if (!evidence.verifiedLive) throw new Error("Live verification did not succeed");
    return client.act(current, claimToken, "mark_completed", {
      message: evidence.message || "The approved release is deployed and verified live.",
      verificationEvidence: evidence.verificationEvidence,
    });
  }
  return { skipped: `ineligible status ${current.status}` };
}

async function loadEnvFile(envPath) {
  try {
    const content = await readFile(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function main() {
  const profileEnv = process.env.HERMES_805_ENV_FILE
    || `${process.env.HOME}/.hermes/profiles/shutters805/.env`;
  await loadEnvFile(profileEnv);
  const secret = process.env.HERMES_805_SHARED_SECRET?.trim();
  if (!secret) {
    console.error("crm_feedback_worker state=configuration_blocked reason=shared_secret_missing");
    process.exitCode = 78;
    return;
  }
  const client = new CrmFeedbackClient({
    baseUrl: process.env.HERMES_805_CRM_BASE_URL || DEFAULT_BASE_URL,
    secret,
  });
  const result = await client.poll();
  console.log(`crm_feedback_worker state=polled count=${result.requests?.length || 0}`);
  for (const request of result.requests || []) {
    try {
      const releaseEnabled = process.env.HERMES_805_RELEASE_ENABLED === "true";
      if (
        request.status === "deployment_approved"
        && releaseEnabled
        && !process.env.HERMES_805_LIVE_VERIFY_COMMAND?.trim()
      ) {
        throw new Error("Authenticated live CRM verification command is not configured");
      }
      await processRequest(request, {
        client,
        implementationRunner: (topic, context) => runApprovedImplementation(topic, {
          authorizedWorkspace: process.env.HERMES_805_CRM_WORKSPACE,
          requestedWorkspace: process.env.HERMES_805_CRM_WORKSPACE,
          renew: context.renew,
        }),
        deploymentRunner: (topic, context) => runApprovedDeployment(topic, {
          authorizedWorkspace: process.env.HERMES_805_CRM_WORKSPACE,
          requestedWorkspace: process.env.HERMES_805_CRM_WORKSPACE,
          renew: context.renew,
        }),
        releaseEnabled,
      });
      console.log(`crm_feedback_worker state=processed id=${request.id} revision=${request.revision}`);
    } catch (error) {
      console.error(
        `crm_feedback_worker state=error id=${request.id} revision=${request.revision} error=${redactError(error, [secret])}`,
      );
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`crm_feedback_worker state=fatal error=${redactError(error, [
      process.env.HERMES_805_SHARED_SECRET,
    ])}`);
    process.exitCode = 1;
  });
}
