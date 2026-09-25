import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CrmAuthError } from "@/lib/crm/auth";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  install: vi.fn(),
  bids: vi.fn(),
  normalizeMailbox: vi.fn(() => "test@example.test"),
  buildQuery: vi.fn(() => "installation-query"),
  paused: true
}));
vi.mock("@/lib/crm/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crm/auth")>()),
  requireCrmUser: mocks.auth
}));
vi.mock("@/lib/crm/installation-invoices", () => ({
  processInstallationInvoiceInbox: mocks.install,
  normalizeInstallationInvoiceMailbox: mocks.normalizeMailbox,
  buildInstallationInvoiceGmailQuery: mocks.buildQuery
}));
vi.mock("@/lib/crm/commercial-bid-opportunities", () => ({
  processCommercialBidOpportunityInbox: mocks.bids
}));
vi.mock("@/lib/crm/commercial-bid-pause", () => ({
  get COMMERCIAL_BID_PULLER_PAUSED() { return mocks.paused; }
}));
import { POST } from "./route";

const database = { from: vi.fn() };
const installationResult = { matched: 2, serviceReports: 1, needsReview: 3, unmatched: 4, skipped: 5, errors: 0 };
const emptyBids = {
  mailbox: "", query: "", scanned: 0, classified: 0, leadsCreated: 0, leadsUpdated: 0,
  reviewsCreated: 0, ignored: 0, skipped: 0, errors: 0
};
function request(payload: unknown = {}) {
  return new NextRequest("https://example.test/api/crm/process-emails", {
    method: "POST", body: JSON.stringify(payload)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.paused = true;
  mocks.auth.mockResolvedValue({ supabase: database, email: "owner@example.test" });
  mocks.install.mockResolvedValue(installationResult);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external call"); }));
});
afterEach(() => vi.unstubAllGlobals());

it("keeps installation processing and returns all commercial counts as zero without ingestion", async () => {
  const req = request();
  const response = await POST(req);
  expect(mocks.auth).toHaveBeenCalledExactlyOnceWith(req);
  expect(mocks.install).toHaveBeenCalledExactlyOnceWith(database, {
    actorEmail: "owner@example.test", costsOnly: true, maxRunMs: 230_000,
    maxResults: undefined, target: null, query: undefined, allowTargetBlankAmountMatch: false
  });
  expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.install.mock.invocationCallOrder[0]);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    installationInvoices: { ok: true, result: installationResult },
    commercialBids: { ok: true, result: emptyBids }, commercialBidIngestion: "paused"
  });
  expect(mocks.bids).not.toHaveBeenCalled();
  expect(mocks.normalizeMailbox).not.toHaveBeenCalled();
  expect(mocks.buildQuery).not.toHaveBeenCalled();
  expect(database.from).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves targeted installation inputs and query construction", async () => {
  const response = await POST(request({ maxResults: 7, installationTarget: {
    customerName: "  Alex Customer  ", jobId: " job-1 ", quoteId: "quote-1", existingInstallationAmount: "250"
  } }));
  expect(response.status).toBe(200);
  expect(mocks.normalizeMailbox).toHaveBeenCalledExactlyOnceWith(process.env.INSTALLATION_INVOICE_MAILBOX);
  expect(mocks.buildQuery).toHaveBeenCalledExactlyOnceWith("test@example.test");
  expect(mocks.install).toHaveBeenCalledExactlyOnceWith(database, {
    actorEmail: "owner@example.test", costsOnly: true, maxRunMs: 230_000, maxResults: 7,
    target: { customerName: "Alex Customer", jobId: "job-1", quoteId: "quote-1", existingInstallationAmount: 250 },
    query: 'installation-query ("Alex Customer" OR "Customer")', allowTargetBlankAmountMatch: true
  });
  expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.normalizeMailbox.mock.invocationCallOrder[0]);
  expect(mocks.buildQuery.mock.invocationCallOrder[0]).toBeLessThan(mocks.install.mock.invocationCallOrder[0]);
  expect(mocks.bids).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves settled installation errors without presenting the commercial pause as an error", async () => {
  mocks.install.mockRejectedValueOnce(new Error("Installation unavailable"));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    installationInvoices: { ok: false, error: "Installation unavailable" },
    commercialBids: { ok: true, result: emptyBids }, commercialBidIngestion: "paused"
  });
  expect(mocks.install).toHaveBeenCalledOnce();
  expect(mocks.bids).not.toHaveBeenCalled();
});

it("still rejects unauthenticated requests before either processor", async () => {
  mocks.auth.mockRejectedValueOnce(new CrmAuthError(401, "CRM session is required."));
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ message: "CRM session is required." });
  expect(mocks.install).not.toHaveBeenCalled();
  expect(mocks.bids).not.toHaveBeenCalled();
});

it("restores the original processors, ordering and failure status when the shared switch is false", async () => {
  mocks.paused = false;
  mocks.install.mockRejectedValueOnce(new Error("Install failed"));
  mocks.bids.mockRejectedValueOnce(new Error("Bids failed"));
  const response = await POST(request({ maxResults: 9 }));
  expect(mocks.bids).toHaveBeenCalledExactlyOnceWith(database, { actorEmail: "owner@example.test", maxResults: 9 });
  expect(mocks.install.mock.invocationCallOrder[0]).toBeLessThan(mocks.bids.mock.invocationCallOrder[0]);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    installationInvoices: { ok: false, error: "Install failed" },
    commercialBids: { ok: false, error: "Bids failed" }
  });
});
