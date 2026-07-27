import { describe, expect, it, vi } from "vitest";

import {
  CrmFeedbackClient,
  createExternalEventId,
  parseHermesDecision,
  processRequest,
  redactError,
  runApprovedImplementation,
  validateWorkspace,
} from "../../../scripts/hermes-805-crm-feedback-worker.mjs";

const topic = {
  company_scope: "805",
  id: "11111111-1111-4111-8111-111111111111",
  revision: 3,
  title: "Fix calendar filter",
  description: "The salesperson filter resets after opening a quote.",
  status: "clarifying",
  messages: [{ author_type: "jessica", body: "It happens on mobile.", revision: 3 }],
};

describe("Hermes 805 CRM feedback worker", () => {
  it("authenticates polling and claims the exact topic revision", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ requests: [topic] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        request: topic,
        claimToken: "claim-3",
        leaseExpiresAt: "2026-07-27T20:00:00.000Z",
      }), { status: 200 }));
    const client = new CrmFeedbackClient({
      baseUrl: "https://www.805shutters.com",
      secret: "private",
      fetchImpl,
    });

    await client.poll();
    await client.claim(topic);

    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://www.805shutters.com/api/integrations/hermes/805/crm-feedback/?limit=20",
    );
    expect(fetchImpl.mock.calls[0][1].headers["x-hermes-secret"]).toBe("private");
    expect(fetchImpl.mock.calls[0][1].headers["x-hermes-company"]).toBe("805");
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      action: "claim",
      id: topic.id,
      revision: 3,
      claimedBy: "home-mac-hermes-805",
    });
  });

  it("creates stable revision-specific event IDs", () => {
    expect(createExternalEventId(topic, "submit_assessment")).toBe(
      "home-mac-hermes-805:11111111-1111-4111-8111-111111111111:r3:submit_assessment",
    );
  });

  it("rejects more than three clarification questions", () => {
    expect(() => parseHermesDecision(JSON.stringify({
      kind: "clarification",
      questions: ["one?", "two?", "three?", "four?"],
    }))).toThrow(/three/i);
  });

  it("requires every structured assessment and work field", () => {
    expect(() => parseHermesDecision(JSON.stringify({
      kind: "assessment",
      message: "Ready.",
      assessment: { problem: "Filter resets." },
      proposedWork: {},
    }))).toThrow(/desiredOutcome/i);
  });

  it("posts clarification into the claimed topic", async () => {
    const actions: Array<{ action: string; payload: Record<string, unknown> }> = [];
    const client = {
      claim: vi.fn().mockResolvedValue({ request: topic, claimToken: "claim-3" }),
      act: vi.fn(async (_request, _token, action, payload) => actions.push({ action, payload })),
    };
    await processRequest(topic, {
      client,
      decide: async () => ({ kind: "clarification", questions: ["Which browser are you using?"] }),
    });
    expect(actions[0].action).toBe("submit_clarification");
    expect(actions[0].payload.message).toContain("Which browser");
  });

  it("does not begin deployment when release execution is disabled", async () => {
    const approved = { ...topic, status: "deployment_approved" };
    const client = {
      claim: vi.fn().mockResolvedValue({ request: approved, claimToken: "claim-3" }),
      act: vi.fn(),
    };
    await processRequest(approved, { client, releaseEnabled: false });
    expect(client.act).not.toHaveBeenCalled();
  });

  it("rejects an MTS topic before claiming it", async () => {
    const client = { claim: vi.fn() };
    await expect(processRequest(
      { ...topic, company_scope: "mts" },
      { client },
    )).rejects.toThrow(/company/i);
    expect(client.claim).not.toHaveBeenCalled();
  });

  it("restricts execution to the configured 805 workspace", () => {
    expect(validateWorkspace("/repo/805", "/repo/805")).toBe("/repo/805");
    expect(() => validateWorkspace("/repo/805", "/repo/other")).toThrow(/authorized/i);
  });

  it("redacts secrets from errors", () => {
    expect(redactError(new Error("request secret-value failed"), ["secret-value"]))
      .toBe("request <redacted> failed");
  });

  it("dispatches Codex in the authorized workspace and runs all verification gates", async () => {
    const calls: Array<{ file: string; args: string[]; cwd?: string }> = [];
    const execImpl = vi.fn(async (file: string, args: string[], options?: { cwd?: string }) => {
      calls.push({ file, args, cwd: options?.cwd });
      return { stdout: "ok", stderr: "" };
    });
    const result = await runApprovedImplementation(
      { ...topic, proposed_work: { implementationSummary: "Keep the filter selected." } },
      {
        authorizedWorkspace: "/repo/805",
        requestedWorkspace: "/repo/805",
        execImpl,
      },
    );
    expect(calls[0].file).toBe("codex");
    expect(calls[0].args).toContain("/repo/805");
    expect(calls.slice(1).map((call) => call.args.join(" "))).toEqual([
      "run typecheck",
      "test",
      "run build",
      "test -- src/lib/crm/feedback-integration-contract.test.ts",
    ]);
    expect(result.verificationEvidence).toMatchObject({
      implemented: true,
      tested: true,
      typechecked: true,
      productionBuild: true,
      focusedWorkflowVerified: true,
      pushed: false,
      migrated: false,
      deployed: false,
      verifiedLive: false,
    });
  });
});
