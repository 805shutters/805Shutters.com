import assert from "node:assert/strict";
import test from "node:test";
import { pollOrderCogs, validateOrderCogsResult, summarizeProcessors } from "./poll_order_cogs.mjs";

const successfulPayload = {
  mailbox: "805shutters@gmail.com",
  query: "test",
  scanned: 3,
  processed: 3,
  matched: 1,
  needsReview: 1,
  unmatched: 1,
  skipped: 0,
  errors: 0,
  applied: 1,
  archiveErrors: 0,
  telegramErrors: 0,
  recordErrors: 0
};

test("validates and summarizes a successful processor result", () => {
  assert.deepEqual(validateOrderCogsResult(successfulPayload), {
    mailbox: "805shutters@gmail.com",
    scanned: 3,
    processed: 3,
    applied: 1,
    matched: 1,
    review: 1,
    unmatched: 1,
    skipped: 0,
    errors: 0,
    recordErrors: 0,
    archiveErrors: 0,
    telegramErrors: 0
  });
});

test("validates the order COGS result inside the combined cron response", () => {
  assert.deepEqual(
    validateOrderCogsResult({
      orderCogs: successfulPayload,
      squarePayments: { checked: 0, recorded: 0, duplicates: 0, review: 0, results: [] },
      peerPayments: { checked: 0, recorded: 0, duplicates: 0, review: 0, ignored: 0, errors: 0 },
    }),
    {
      mailbox: "805shutters@gmail.com",
      scanned: 3,
      processed: 3,
      applied: 1,
      matched: 1,
      review: 1,
      unmatched: 1,
      skipped: 0,
      errors: 0,
      recordErrors: 0,
      archiveErrors: 0,
      telegramErrors: 0,
    },
  );
});

test("reports an auxiliary processor failure without failing order ingestion", () => {
  const summary = validateOrderCogsResult({
    orderCogs: successfulPayload,
    squarePayments: null,
    peerPayments: { checked: 0, recorded: 0, duplicates: 0, review: 0, ignored: 0, errors: 0 },
    processorStates: {
      orderCogs: { status: "completed" },
      squarePayments: {
        status: "failed",
        message: "Square payment reconciliation is temporarily unavailable.",
      },
      peerPayments: { status: "completed" },
    },
  });

  assert.deepEqual(summary.processorWarnings, [
    "squarePayments: Square payment reconciliation is temporarily unavailable.",
  ]);
  assert.equal(summary.errors, 0);
});

test("rejects a processor error count", () => {
  assert.throws(
    () => validateOrderCogsResult({ ...successfulPayload, errors: 1, lastError: "Gmail failed" }),
    /Processor reported 1 error.*Gmail failed/
  );
});

test("rejects an unexpected production mailbox", () => {
  assert.throws(
    () => validateOrderCogsResult({ ...successfulPayload, mailbox: "wrong@example.com" }),
    /unexpected mailbox/
  );
});

test("rejects redirects without following them", async () => {
  const fetchImpl = async () => new Response("", {
    status: 308,
    headers: { location: "https://unexpected.example/api/cron/order-cogs" }
  });

  await assert.rejects(
    pollOrderCogs({ secret: "test", fetchImpl }),
    /redirected \(308\)/
  );
});

test("rejects a successful non-processor response", async () => {
  const fetchImpl = async () => new Response("Redirecting...", { status: 200 });

  await assert.rejects(
    pollOrderCogs({ secret: "test", fetchImpl }),
    /did not return JSON/
  );
});


test("partial-failure diagnostics retain mailbox and peer counts without exposing email evidence", async () => {
  const payload = {
    orderCogs: { ...successfulPayload, deferred: 77, emails: [{ body: "private customer email" }],
      mailboxes: [{ ...successfulPayload, deferred: 77 }, { ...successfulPayload, mailbox: "805@805shutters.com" }] },
    peerPayments: { checked: 2, recorded: 0, review: 2, errors: 0, results: [{ customer: "private customer" }] },
    processorStates: { orderCogs: { status: "failed", message: "private upstream detail" }, peerPayments: { status: "completed" } },
  };
  const summary = summarizeProcessors(payload);
  assert.equal(summary.orderCogs.deferred, 77);
  assert.equal(summary.mailboxes.length, 2);
  assert.equal(summary.peerPayments.checked, 2);
  assert.ok(!JSON.stringify(summary).includes("private"));
  await assert.rejects(pollOrderCogs({ secret: "test", fetchImpl: async () => new Response(JSON.stringify(payload), { status: 502 }) }), error => {
    assert.match(error.message, /HTTP 502/);
    assert.match(error.message, /"deferred":77/);
    assert.match(error.message, /"checked":2/);
    assert.ok(!error.message.includes("private"));
    return true;
  });
});
