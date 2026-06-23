import { describe, it, expect } from "vitest";
import { isOverdueDeposit, isOverdueBalance, shouldAlert, isStaleQuote, shouldNudge } from "./follow-ups";

const NOW = Date.UTC(2026, 5, 22); // 2026-06-22Z
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

describe("isOverdueDeposit", () => {
  const base = { depositDue: 200, depositPaid: 0, balance: 800, isPaidInFull: false, lastAlertedAt: null } as const;
  it("flags a sold job with an unpaid deposit past the threshold", () => {
    expect(isOverdueDeposit({ ...base, status: "sold", soldDate: daysAgo(5) }, NOW, 3)).toBe(true);
  });
  it("ignores a recently-sold job (within threshold)", () => {
    expect(isOverdueDeposit({ ...base, status: "sold", soldDate: daysAgo(1) }, NOW, 3)).toBe(false);
  });
  it("ignores a deposit already paid", () => {
    expect(isOverdueDeposit({ ...base, status: "sold", depositPaid: 200, soldDate: daysAgo(5) }, NOW, 3)).toBe(false);
  });
  it("ignores non-sold statuses", () => {
    expect(isOverdueDeposit({ ...base, status: "ordered", soldDate: daysAgo(5) }, NOW, 3)).toBe(false);
  });
});

describe("isOverdueBalance", () => {
  it("flags a completed job with an unpaid balance past the threshold", () => {
    expect(isOverdueBalance({ status: "installed", soldDate: daysAgo(10), depositDue: 200, depositPaid: 200, balance: 500, isPaidInFull: false, lastAlertedAt: null }, NOW, 7)).toBe(true);
  });
  it("ignores a paid-in-full job", () => {
    expect(isOverdueBalance({ status: "installed", soldDate: daysAgo(10), depositDue: 0, depositPaid: 0, balance: 0, isPaidInFull: true, lastAlertedAt: null }, NOW, 7)).toBe(false);
  });
});

describe("shouldAlert", () => {
  it("alerts when never alerted", () => {
    expect(shouldAlert({ lastAlertedAt: null }, NOW, 3)).toBe(true);
  });
  it("does not alert within the cooldown", () => {
    expect(shouldAlert({ lastAlertedAt: daysAgo(1) }, NOW, 3)).toBe(false);
  });
  it("alerts again after the cooldown", () => {
    expect(shouldAlert({ lastAlertedAt: daysAgo(5) }, NOW, 3)).toBe(true);
  });
});

describe("isStaleQuote", () => {
  const base = { signedAt: null, lastNudgedAt: null } as const;
  it("flags a sent, unsigned quote past the threshold", () => {
    expect(isStaleQuote({ status: "sent", sentAt: daysAgo(7), ...base }, NOW, 5)).toBe(true);
  });
  it("ignores a signed quote", () => {
    expect(isStaleQuote({ status: "sent", ...base, sentAt: daysAgo(7), signedAt: daysAgo(3) }, NOW, 5)).toBe(false);
  });
  it("ignores a recently-sent quote", () => {
    expect(isStaleQuote({ status: "sent", sentAt: daysAgo(1), ...base }, NOW, 5)).toBe(false);
  });
});

describe("shouldNudge", () => {
  it("nudges when never nudged", () => {
    expect(shouldNudge({ lastNudgedAt: null }, NOW, 5)).toBe(true);
  });
  it("respects the cooldown", () => {
    expect(shouldNudge({ lastNudgedAt: daysAgo(2) }, NOW, 5)).toBe(false);
    expect(shouldNudge({ lastNudgedAt: daysAgo(6) }, NOW, 5)).toBe(true);
  });
});
