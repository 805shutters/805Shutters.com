#!/usr/bin/env node

const DEFAULT_URL = "https://www.805shutters.com/api/cron/order-cogs";
const DEFAULT_MAILBOX = "805shutters@gmail.com";
const COUNT_FIELDS = [
  "scanned",
  "processed",
  "matched",
  "needsReview",
  "unmatched",
  "skipped",
  "errors",
  "archived",
  "archiveErrors",
  "telegramSent",
  "telegramErrors"
];

function count(payload, field) {
  const value = payload[field] ?? 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Processor returned an invalid ${field} count.`);
  }
  return value;
}

export function validateOrderCogsResult(payload, expectedMailbox = DEFAULT_MAILBOX) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Processor response was not a JSON object.");
  }

  for (const field of ["mailbox", "query", "scanned", "processed", "matched", "needsReview", "unmatched", "skipped", "errors"]) {
    if (!(field in payload)) throw new Error(`Processor response is missing ${field}.`);
  }
  for (const field of COUNT_FIELDS) count(payload, field);
  for (const field of ["applied", "recordErrors"]) {
    if (field in payload && payload[field] !== undefined) count(payload, field);
  }

  const mailbox = String(payload.mailbox || "").trim().toLowerCase();
  if (mailbox !== expectedMailbox.trim().toLowerCase()) {
    throw new Error(`Processor used unexpected mailbox ${mailbox || "(empty)"}; expected ${expectedMailbox}.`);
  }

  const errorCounts = {
    errors: count(payload, "errors"),
    recordErrors: count(payload, "recordErrors"),
    archiveErrors: count(payload, "archiveErrors"),
    telegramErrors: count(payload, "telegramErrors")
  };
  const errorTotal = Object.values(errorCounts).reduce((sum, value) => sum + value, 0);
  const summary = {
    mailbox,
    scanned: count(payload, "scanned"),
    processed: count(payload, "processed"),
    applied: count(payload, "applied"),
    matched: count(payload, "matched"),
    review: count(payload, "needsReview"),
    unmatched: count(payload, "unmatched"),
    skipped: count(payload, "skipped"),
    errors: errorTotal,
    ...errorCounts
  };

  if (errorTotal > 0) {
    const diagnostic = payload.lastError || payload.lastInsertError || "See processor response.";
    throw new Error(`Processor reported ${errorTotal} error(s): ${diagnostic}`);
  }

  return summary;
}

export async function pollOrderCogs({
  url = process.env.ORDER_COGS_CRON_URL || DEFAULT_URL,
  secret = process.env.ORDER_COGS_CRON_SECRET,
  expectedMailbox = process.env.EXPECTED_ORDER_COGS_MAILBOX || DEFAULT_MAILBOX,
  fetchImpl = fetch
} = {}) {
  if (!secret?.trim()) throw new Error("ORDER_COGS_CRON_SECRET is required.");

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      accept: "application/json"
    },
    redirect: "manual"
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Processor endpoint redirected (${response.status}) to ${response.headers.get("location") || "(missing location)"}.`);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Processor endpoint returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`Processor endpoint did not return JSON: ${body.slice(0, 500)}`);
  }

  return validateOrderCogsResult(payload, expectedMailbox);
}

function runningAsMain() {
  return process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
}

if (runningAsMain()) {
  try {
    const summary = await pollOrderCogs();
    console.log(
      [
        "Order COGS processor completed.",
        `mailbox=${summary.mailbox}`,
        `scanned=${summary.scanned}`,
        `processed=${summary.processed}`,
        `applied=${summary.applied}`,
        `matched=${summary.matched}`,
        `review=${summary.review}`,
        `unmatched=${summary.unmatched}`,
        `skipped=${summary.skipped}`,
        `errors=${summary.errors}`
      ].join(" ")
    );
  } catch (error) {
    console.error(`Order COGS processor failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
