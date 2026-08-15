import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { runOrderCogsCron, type OrderCogsCronDependencies } from "./route";

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
      checked: 1,
      recorded: 1,
      duplicates: 0,
      review: 0,
      results: [],
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

  it("disables manufacturer COGS auto-apply and still runs Square and peer processors", async () => {
    const deps = dependencies();

    const response = await runOrderCogsCron(request(), deps);

    expect(response.status).toBe(200);
    expect(deps.processOrderCogs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorEmail: "order-cogs-cron",
        autoApply: false,
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
