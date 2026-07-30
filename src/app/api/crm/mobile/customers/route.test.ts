import { describe, expect, it } from "vitest";
import { MOBILE_CUSTOMER_JOB_COLUMNS, MOBILE_CUSTOMER_QUOTE_COLUMNS } from "./route";

describe("mobile customer search query", () => {
  it("selects only columns that exist on crm_jobs", () => {
    expect(MOBILE_CUSTOMER_JOB_COLUMNS.split(",")).toEqual([
      "id",
      "customer_name",
      "phone",
      "email",
      "address",
      "city",
      "estimated_total",
      "deposit_paid",
      "meta",
    ]);
    expect(MOBILE_CUSTOMER_JOB_COLUMNS).not.toMatch(/\b(state|zip)\b/);
  });

  it("loads the authoritative quote archive timestamp for strict scope filtering", () => {
    expect(MOBILE_CUSTOMER_QUOTE_COLUMNS.split(",")).toContain("archived_at");
  });
});
