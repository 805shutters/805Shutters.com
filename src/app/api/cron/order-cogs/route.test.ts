import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isAuxiliaryRunTime, runOrderCogsCron, type OrderCogsCronDependencies } from "./handler";

type ActivityEvent = {
  action: string;
  metadata: Record<string, unknown>;
};

function request() {
  return new NextRequest("https://www.805shutters.com/api/cron/order-cogs/", {
    method: "POST",
    headers: { authorization: "Bearer cron-secret" },
  });
}

function dependencies() {
  const activity: ActivityEvent[] = [];
  const deps: OrderCogsCronDependencies = {
    env: { ORDER_COGS_CRON_SECRET: "cron-secret" },
    getSupabase: vi.fn(() => ({
      from: () => ({
        insert: (row: ActivityEvent) => {
          activity.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    }) as never),
    processOrderCogs: vi.fn(async () => ({
      mailbox: "805shutters@gmail.com",
      query: "in:inbox",
      scanned: 0,
      processed: 0,
      matched: 0,
      needsReview: 0,
      unmatched: 0,
      skipped: 0,
      errors: 0,
      archived: 0,
      archiveErrors: 0,
      telegramSent: 0,
      telegramErrors: 0,
      emails: [],
    })),
    reconcileSquarePayments: vi.fn(async () => ({
      status: "synced",
    })),
    processPeerPayments: vi.fn(async () => ({
      mailbox: "805shutters@gmail.com",
      query: "in:inbox",
      checked: 1,
      recorded: 0,
      duplicates: 0,
      review: 0,
      ignored: 1,
      errors: 0,
    })),
  };
  return Object.assign(deps, { activity });
}

describe("order COGS cron route", () => {
  it("keeps order ingestion available when the auxiliary Square check is unauthorized", async () => {
    const deps = dependencies();
    vi.mocked(deps.reconcileSquarePayments).mockRejectedValue(
      new Error("Square customer lookup failed (401): secret upstream details"),
    );

    const response = await runOrderCogsCron(request(), deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      orderCogs: {
        mailbox: "805shutters@gmail.com",
        query: "in:inbox",
        scanned: 0,
        processed: 0,
        matched: 0,
        needsReview: 0,
        unmatched: 0,
        skipped: 0,
        errors: 0,
        archived: 0,
        archiveErrors: 0,
        telegramSent: 0,
        telegramErrors: 0,
        emails: [],
      },
      counts: {
        matched: 0,
        needs_review: 0,
        unmatched: 0,
        skipped: 0,
        applied: 0,
        errors: 0,
      },
      squarePayments: null,
      peerPayments: {
        mailbox: "805shutters@gmail.com",
        query: "in:inbox",
        checked: 1,
        recorded: 0,
        duplicates: 0,
        review: 0,
        ignored: 1,
        errors: 0,
      },
      processorStates: {
        orderCogs: { status: "completed" },
        squarePayments: {
          status: "failed",
          message: "Square payment reconciliation is temporarily unavailable.",
        },
        peerPayments: { status: "completed" },
      },
    });
    expect(deps.processPeerPayments).toHaveBeenCalledOnce();
  });

  it("does not run processors when cron authentication is unconfigured", async () => {
    const deps = dependencies();
    deps.env = {};
    const response = await runOrderCogsCron(request(), deps);
    expect(response.status).toBe(503);
    expect(deps.processOrderCogs).not.toHaveBeenCalled();
    expect(deps.reconcileSquarePayments).not.toHaveBeenCalled();
    expect(deps.processPeerPayments).not.toHaveBeenCalled();
  });

  it("still checks customer receipts when vendor email processing throws", async () => {
    const deps = dependencies();
    vi.mocked(deps.processOrderCogs).mockRejectedValue(new Error("upstream unavailable"));
    const response = await runOrderCogsCron(request(), deps);
    expect(response.status).toBe(502);
    expect(deps.processPeerPayments).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      orderCogs: null,
      processorStates: { orderCogs: { status: "failed" }, peerPayments: { status: "completed" } },
    });
    expect(deps.activity.map(event => event.action)).toContain("order-cogs.failed");
    expect(deps.activity.map(event => event.action)).not.toContain("order-cogs.succeeded");
  });

  it("reports partial customer receipt failures as failed intake", async () => {
    const deps = dependencies();
    const result = await deps.processPeerPayments({} as never);
    vi.mocked(deps.processPeerPayments).mockResolvedValue({ ...result, errors: 1 });
    const response = await runOrderCogsCron(request(), deps);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      processorStates: { peerPayments: { status: "failed" } },
    });
  });

  it("uses the shared product save and still runs Square and peer processors", async () => {
    const deps = dependencies();

    const response = await runOrderCogsCron(request(), deps);

    expect(response.status).toBe(200);
    expect(deps.processOrderCogs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorEmail: "order-cogs-cron",
        autoApply: false,
        productAutoApply: true,
        archive: false,
      }),
    );
    expect(deps.reconcileSquarePayments).toHaveBeenCalledOnce();
    expect(deps.processPeerPayments).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      processorStates: {
        orderCogs: { status: "completed" },
        squarePayments: { status: "completed" },
        peerPayments: { status: "completed" },
      },
    });
  });
});


describe("frequent order intake with twice daily Pacific payment checks", () => {
  it("has one automatic scheduler with a direct, non-redirecting endpoint", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.crons.filter((cron: {path:string}) => cron.path.includes("order-cogs"))).toEqual([{ path: "/api/cron/order-cogs/", schedule: "*/10 * * * *" }]);
    expect(readFileSync(".github/workflows/order-cogs-email-poll.yml", "utf8")).not.toContain("  schedule:");
  });
  it.each([
    ["2026-09-19T15:00:00Z", true], ["2026-09-20T03:00:00Z", true],
    ["2026-09-19T16:00:00Z", false], ["2026-09-20T04:00:00Z", false],
    ["2026-12-19T16:00:00Z", true], ["2026-12-20T04:00:00Z", true],
    ["2026-12-19T15:00:00Z", false], ["2026-12-20T03:00:00Z", false],
    ["2026-03-08T15:00:00Z", true], ["2026-11-01T16:00:00Z", true],
  ])("runs only at the requested local time: %s", (date, expected) => {
    expect(isAuxiliaryRunTime(new Date(date))).toBe(expected);
  });
  it("processes orders outside payment hours without running payment processors", async () => {
    const deps = dependencies(); deps.now = () => new Date("2026-09-19T16:00:00Z");
    const response = await runOrderCogsCron(new NextRequest(request().url, { headers: request().headers }), deps);
    expect(response.status).toBe(200);
    expect(deps.processOrderCogs).toHaveBeenCalledOnce();
    expect(deps.reconcileSquarePayments).not.toHaveBeenCalled();
    expect(deps.processPeerPayments).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({processorStates:{orderCogs:{status:"completed"},squarePayments:{status:"skipped"},peerPayments:{status:"skipped"}}});
  });
  it("does not repeat payment checks throughout the 8 AM hour", () => {
    expect(isAuxiliaryRunTime(new Date("2026-10-09T15:10:00Z"))).toBe(false);
  });
  it("accepts the Vercel cron credential even when the manual recovery secret differs", async () => {
    const deps = dependencies(); deps.env.CRON_SECRET = "vercel-secret";
    deps.now = () => new Date("2026-09-19T15:00:00Z");
    const response = await runOrderCogsCron(new NextRequest(request().url, { headers: { authorization: "Bearer vercel-secret" } }), deps);
    expect(response.status).toBe(200); expect(deps.processOrderCogs).toHaveBeenCalledOnce();
  });
  it("reports partial processing failure while completing independent processors", async () => {
    const deps = dependencies(); const result = await deps.processOrderCogs({} as never);
    vi.mocked(deps.processOrderCogs).mockResolvedValue({ ...result, errors: 1 });
    const response = await runOrderCogsCron(request(), deps);
    expect(response.status).toBe(502); expect(deps.processPeerPayments).toHaveBeenCalledOnce();
    expect(deps.activity.some(event => event.action === "order-cogs.failed")).toBe(true);
  });

  it("returns 200 for needs_review and unmatched rows when nothing errored", async () => {
    const deps = dependencies();
    const result = await deps.processOrderCogs({} as never);
    vi.mocked(deps.processOrderCogs).mockResolvedValue({
      ...result,
      matched: 4,
      needsReview: 2,
      unmatched: 3,
      skipped: 1,
      applied: 4,
      errors: 0,
      deferred: 5,
    });

    const response = await runOrderCogsCron(request(), deps);
    const body = await response.json();
    const counts = {
      matched: 4,
      needs_review: 2,
      unmatched: 3,
      skipped: 1,
      applied: 4,
      errors: 0,
    };

    expect(response.status).toBe(200);
    expect(body.processorStates.orderCogs).toEqual({ status: "completed" });
    expect(body.counts).toEqual(counts);
    expect(body.orderCogs).toMatchObject({
      matched: 4,
      needsReview: 2,
      unmatched: 3,
      skipped: 1,
      applied: 4,
      errors: 0,
    });
    const orderEvents = deps.activity.filter(event => event.action.startsWith("order-cogs."));
    expect(orderEvents.map(event => event.action)).toEqual(["order-cogs.running", "order-cogs.succeeded"]);
    expect(orderEvents[1]?.metadata).toMatchObject({ state: "succeeded", ...counts });
    expect(deps.activity.some(event => event.action === "order-cogs.failed")).toBe(false);
  });

  it("returns non-2xx and records order-cogs.failed when a row errors", async () => {
    const deps = dependencies();
    const result = await deps.processOrderCogs({} as never);
    vi.mocked(deps.processOrderCogs).mockResolvedValue({
      ...result,
      matched: 1,
      needsReview: 2,
      unmatched: 1,
      skipped: 0,
      applied: 1,
      errors: 1,
    });

    const response = await runOrderCogsCron(request(), deps);
    const body = await response.json();
    const failed = deps.activity.filter(event => event.action === "order-cogs.failed");

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBe(502);
    expect(body.processorStates.orderCogs.status).toBe("failed");
    expect(body.counts).toEqual({
      matched: 1,
      needs_review: 2,
      unmatched: 1,
      skipped: 0,
      applied: 1,
      errors: 1,
    });
    expect(failed).toHaveLength(1);
    expect(failed[0]?.metadata).toMatchObject({
      state: "failed",
      matched: 1,
      needs_review: 2,
      unmatched: 1,
      skipped: 0,
      applied: 1,
      errors: 1,
    });
    expect(deps.activity.some(event => event.action === "order-cogs.succeeded")).toBe(false);
  });
});
