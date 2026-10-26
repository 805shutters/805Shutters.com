import { describe, expect, it } from "vitest";
import { callSummaryPresentation } from "./summary-status";

const text = "Call CAabc outcome: incomplete. Unconfirmed transcript: Please call about shutters. The staff takeover portion cannot be summarized because the stream detached.";

describe("phone desk call summary", () => {
  it("shows the factual summary for an unknown caller without a customer write", () => {
    const view = callSummaryPresentation({ summary: { text, streamDetached: true }, summarySync: "local", matchStatus: "unmatched" });
    expect(view?.text).toBe(text);
    expect(view?.sync).toBe("Saved on this call. No single customer is linked, so no customer or job file was updated.");
    expect(view?.text).not.toMatch(/staff said/i);
  });

  it("shows an ambiguous caller on the call and does not claim a customer or job write", () => {
    const view = callSummaryPresentation({ summary: { text: "Call CAabc outcome: ended." }, summarySync: "local", matchStatus: "ambiguous" });
    expect(view?.sync).toMatch(/more than one customer/);
    expect(view?.sync).not.toMatch(/written to the customer/);
  });

  it("keeps sync status accurate for a matched caller", () => {
    expect(callSummaryPresentation({ summary: { text }, summarySync: "pending", matchStatus: "matched" })?.sync).toMatch(/still syncing/);
    expect(callSummaryPresentation({ summary: { text }, summarySync: "failed", matchStatus: "matched" })?.sync).toMatch(/could not be saved/);
    expect(callSummaryPresentation({ summary: { text }, summarySync: "synced", matchStatus: "matched" })?.sync).toBe("Saved on this call and written to the customer file.");
    expect(callSummaryPresentation({ summary: { text }, summarySync: "synced", summaryJobId: "job-1", matchStatus: "matched" })?.sync).toMatch(/matching job/);
  });
});
