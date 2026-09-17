import { describe, expect, it } from "vitest";
import { jobContractPreviewUrl } from "./job-contract-preview";
import type { JobTrackingViewItem } from "./job-tracking-view";

const item = (values: Partial<JobTrackingViewItem> = {}) => ({ contractUrl: null, contracts: [], ...values } as JobTrackingViewItem);
describe("job contract preview routing", () => {
  it("opens the matched customer copy before falling back to a quote editor", () => {
    expect(jobContractPreviewUrl(item({ contractUrl: "https://www.805shutters.com/quote/sold-copy?version=2#terms", quote: { id: "quote-1" } as JobTrackingViewItem["quote"] }))).toBe("/quote/sold-copy?version=2&crmContract=1#terms");
  });
  it("uses the exact quote on the job when no saved customer copy exists", () => {
    expect(jobContractPreviewUrl(item({ quote: { id: "order-2" } as JobTrackingViewItem["quote"] }))).toBe("/crm/quote/order-2/contract-preview");
  });
  it("uses a share token only from the contracts already matched to this job", () => {
    expect(jobContractPreviewUrl(item({ contracts: [{ share_token: "matched-token" }] as JobTrackingViewItem["contracts"] }))).toBe("/quote/matched-token?crmContract=1");
  });
  it("leaves signed external document URLs intact", () => {
    const url = "https://documents.example.test/contract.pdf?signature=abc%2Fdef&expires=123";
    expect(jobContractPreviewUrl(item({ contractUrl: url }))).toBe(url);
  });
  it("does not substitute another quote from the customer file", () => {
    expect(jobContractPreviewUrl(item({ file: { quotes: [{ id: "unrelated-quote", share_token: "wrong-token" }] } as JobTrackingViewItem["file"] }))).toBeNull();
  });
  it("rejects unsafe document URLs", () => {
    expect(jobContractPreviewUrl(item({ contractUrl: "javascript:alert(1)" }))).toBeNull();
  });
});
