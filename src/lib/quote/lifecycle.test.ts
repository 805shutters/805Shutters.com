import { describe, it, expect } from "vitest";
import {
  NEXT_STATUS,
  STATUS_TIMESTAMP_COLUMN,
  jobStatusForQuote,
  advanceJobStatus,
  getNextStatus,
} from "./lifecycle";

describe("quote → job status mapping", () => {
  it("maps each quote status to the right job status", () => {
    expect(jobStatusForQuote("draft")).toBe("quoted");
    expect(jobStatusForQuote("sent")).toBe("quoted");
    expect(jobStatusForQuote("approved")).toBe("sold");
    expect(jobStatusForQuote("sold")).toBe("sold");
    expect(jobStatusForQuote("ordered")).toBe("ordered");
    expect(jobStatusForQuote("received")).toBe("ordered");
    expect(jobStatusForQuote("installed")).toBe("installed");
    expect(jobStatusForQuote("invoiced")).toBe("installed");
    expect(jobStatusForQuote("paid")).toBe("closed");
    expect(jobStatusForQuote("lost")).toBe("lost");
  });
});

describe("advanceJobStatus (forward-only)", () => {
  it("moves a scheduled job forward when quoting/selling", () => {
    expect(advanceJobStatus("scheduled", "quoted")).toBe("quoted");
    expect(advanceJobStatus("scheduled", "sold")).toBe("sold");
    expect(advanceJobStatus("new", "quoted")).toBe("quoted");
  });
  it("never downgrades a job", () => {
    expect(advanceJobStatus("sold", "quoted")).toBe("sold");
    expect(advanceJobStatus("ordered", "quoted")).toBe("ordered");
    expect(advanceJobStatus("installed", "sold")).toBe("installed");
  });
  it("lost is terminal and always wins; closed/lost jobs are not reopened", () => {
    expect(advanceJobStatus("sold", "lost")).toBe("lost");
    expect(advanceJobStatus("closed", "quoted")).toBe("closed");
    expect(advanceJobStatus("lost", "quoted")).toBe("lost");
  });
});

describe("linear lifecycle", () => {
  it("advances along the pipeline", () => {
    expect(getNextStatus("draft")).toBe("sent");
    expect(getNextStatus("sent")).toBe("sold");
    expect(getNextStatus("sold")).toBe("ordered");
    expect(getNextStatus("installed")).toBe("invoiced");
    expect(getNextStatus("paid")).toBe("archived");
    expect(getNextStatus("archived")).toBeNull();
  });
  it("knows the timestamp column for each state (and which have none)", () => {
    expect(STATUS_TIMESTAMP_COLUMN.sent).toBe("sent_at");
    expect(STATUS_TIMESTAMP_COLUMN.sold).toBe("sold_at");
    expect(STATUS_TIMESTAMP_COLUMN.installed).toBe("installed_at");
    expect(STATUS_TIMESTAMP_COLUMN.invoiced).toBeUndefined();
    expect(NEXT_STATUS.lost).toBeNull();
  });
});
