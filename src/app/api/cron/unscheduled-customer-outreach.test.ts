import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const UNSCHEDULED_CRON_PATHS = [
  "stale-quotes",
  "commercial-campaigns",
  "square-contract-reminders",
  "payment-plan-reminders",
];

describe("customer outreach stays off the Vercel cron schedule", () => {
  it("does not schedule stale quotes, commercial campaigns, contract reminders, or payment-plan reminders", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const scheduled = config.crons.map((entry) => entry.path);
    for (const path of UNSCHEDULED_CRON_PATHS) {
      expect(scheduled.some((entry) => entry.includes(path))).toBe(false);
    }
    expect(config.crons.filter((entry) => entry.path.includes("order-cogs"))).toEqual([
      { path: "/api/cron/order-cogs/", schedule: "*/10 * * * *" },
    ]);
  });
});
