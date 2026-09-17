import { describe, expect, it } from "vitest";
import type { CrmDashboardData, CrmQuote, CrmCustomerContract } from "./types";
import { buildContractLibrary, searchContracts } from "./contract-library";
const quote = (id: string, name: string, extra = {}) => ({ id, customer_name: name, quote_number: id, share_token: `token-${id}`, meta: {}, ...extra } as CrmQuote);
const contract = (id: string, extra = {}) => ({ id, title: "Signed contract", meta: {}, ...extra } as CrmCustomerContract);
const data = (extra: Partial<CrmDashboardData> = {}) => ({ quotes: [], customerContracts: [], customerFiles: [], customers: [], jobs: [], bookkeepingRows: [], ...extra } as unknown as CrmDashboardData);
describe("contract-only customer search", () => {
  it("searches names only, ignoring case, accents and word order", () => {
    const entries = buildContractLibrary(data({ quotes: [quote("805-1234", "José Smith"), quote("other", "Jane Doe")] }));
    expect(searchContracts(entries, " SMITH jose ").map(entry => entry.customerName)).toEqual(["José Smith"]);
    expect(searchContracts(entries, "805-1234")).toEqual([]);
    expect(searchContracts(entries, "   ")).toEqual([]);
  });
  it("does not show ordinary quote drafts, deleted documents or vendor-order paperwork", () => {
    expect(buildContractLibrary(data({ quotes: [quote("draft", "Draft", {share_token:null}), quote("deleted", "Deleted", {meta:{deleted_at:"today"}})], customerContracts:[contract("vendor",{contract_url:"https://vendor.test/order.pdf",meta:{source:"bookkeeping_row"}})] }))).toEqual([]);
  });
  it("deduplicates the same shared contract across quote and document records", () => {
    const entries = buildContractLibrary(data({ quotes:[quote("one", "Jane Doe")], customerContracts:[contract("doc",{quote_id:"one",share_token:"token-one"})] }));
    expect(entries).toHaveLength(1);expect(entries[0].url).toBe("/quote/token-one?crmContract=1");
  });
  it("prefers the linked quote customer copy when the contract record has no URL", () => {
    const entries = buildContractLibrary(data({ quotes:[quote("one", "Jane Doe")], customerContracts:[contract("doc",{quote_id:"one"})] }));
    expect(entries).toHaveLength(1);expect(entries[0].url).toBe("/quote/token-one?crmContract=1");
  });
  it("keeps multiple contracts and same-name customers separate by source IDs", () => {
    const entries = buildContractLibrary(data({ quotes:[quote("first", "Jane Doe"),quote("second", "Jane Doe")], customerContracts:[contract("doc",{quote_id:"second",contract_url:"https://docs.test/second.pdf?signature=exact"})] }));
    expect(entries).toHaveLength(2);
    expect(entries.find(entry=>entry.id==="contract:doc")?.url).toBe("https://docs.test/second.pdf?signature=exact");
    expect(entries.find(entry=>entry.id==="quote:first")?.url).toBe("/quote/token-first?crmContract=1");
  });
  it("includes standalone customer contracts and signed quotes without a share token", () => {
    const entries = buildContractLibrary(data({ quotes:[quote("signed", "April Sample",{share_token:null,signed_at:"2026-09-01"})], customers:[{id:"customer",display_name:"Noel Robinson"}] as CrmDashboardData["customers"], customerContracts:[contract("standalone",{customer_id:"customer",contract_url:"https://docs.test/noel.pdf"})] }));
    expect(entries.find(entry=>entry.customerName==="Noel Robinson")?.url).toBe("https://docs.test/noel.pdf");
    expect(entries.find(entry=>entry.customerName==="April Sample")?.url).toBe("/crm/quote/signed/contract-preview");
  });
  it("includes a signed contract explicitly recorded against a bookkeeping job", () => {
    const entries = buildContractLibrary(data({bookkeepingRows:[{id:"legacy",customerName:"Noel Robinson",meta:{job_tracking_contract:{url:"https://docs.test/signed.pdf",signed_at:"2026-09-01"}}}] as unknown as CrmDashboardData["bookkeepingRows"]}));
    expect(entries).toMatchObject([{customerName:"Noel Robinson",url:"https://docs.test/signed.pdf"}]);
  });
  it("does not borrow an unrelated customer's quote for an unavailable document", () => {
    const entries = buildContractLibrary(data({ quotes:[quote("other", "Jane Doe")], customerContracts:[contract("missing",{contract_url:"javascript:alert(1)"})] }));
    expect(entries.find(entry=>entry.id==="contract:missing")?.url).toBeNull();
  });
});
