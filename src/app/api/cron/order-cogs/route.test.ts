import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isOrderCogsRunTime, runOrderCogsCron, type OrderCogsCronDependencies } from "./route";

function request() {
  return new NextRequest("https://www.805shutters.com/api/cron/order-cogs/", {
    method: "POST",
    headers: { authorization: "Bearer cron-secret" },
  });
}

function dependencies(): OrderCogsCronDependencies {
  return {
    env: { ORDER_COGS_CRON_SECRET: "cron-secret" },
    getSupabase: vi.fn(() => ({} as never)),
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


describe("twice daily Pacific schedule", () => {
  it("has one automatic scheduler with a direct, non-redirecting endpoint", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.crons.filter((cron: {path:string}) => cron.path.includes("order-cogs"))).toEqual([{ path: "/api/cron/order-cogs/", schedule: "0 3,4,15,16 * * *" }]);
    expect(readFileSync(".github/workflows/order-cogs-email-poll.yml", "utf8")).not.toContain("  schedule:");
  });
  it.each([
    ["2026-09-19T15:00:00Z", true], ["2026-09-20T03:00:00Z", true],
    ["2026-09-19T16:00:00Z", false], ["2026-09-20T04:00:00Z", false],
    ["2026-12-19T16:00:00Z", true], ["2026-12-20T04:00:00Z", true],
    ["2026-12-19T15:00:00Z", false], ["2026-12-20T03:00:00Z", false],
    ["2026-03-08T15:00:00Z", true], ["2026-11-01T16:00:00Z", true],
  ])("runs only at the requested local time: %s", (date, expected) => {
    expect(isOrderCogsRunTime(new Date(date))).toBe(expected);
  });
  it("skips the unused UTC offset without touching processors", async () => {
    const deps = dependencies(); deps.now = () => new Date("2026-09-19T16:00:00Z");
    const response = await runOrderCogsCron(new NextRequest(request().url, { headers: request().headers }), deps);
    expect(response.status).toBe(200);
    expect(deps.getSupabase).not.toHaveBeenCalled();
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
  });
});
