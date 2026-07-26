import assert from "node:assert/strict";
import test from "node:test";
import { pollOrderCogs, validateOrderCogsResult } from "./poll_order_cogs.mjs";

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
