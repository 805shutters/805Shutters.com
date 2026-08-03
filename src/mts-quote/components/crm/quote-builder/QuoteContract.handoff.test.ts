import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contractSource = readFileSync(fileURLToPath(new URL("./QuoteContract.tsx", import.meta.url)), "utf8");
const sendSource = readFileSync(fileURLToPath(new URL("./SendQuoteDialog.tsx", import.meta.url)), "utf8");
const serverWorkflowSource = readFileSync(
  fileURLToPath(new URL("../../../../lib/crm/sales-quote-send.ts", import.meta.url)),
  "utf8",
);

describe("V4 contract handoff", () => {
  it("uses authenticated server routes for customer send and sold conversion", () => {
    expect(sendSource).toContain("/api/crm/sales-quotes/${encodeURIComponent(quote.id)}/send");
    expect(contractSource).toContain("/api/crm/sales-quotes/${encodeURIComponent(activeQuoteId!)}/sold");
    expect(contractSource).toContain("JSON.stringify({ measureDecision })");
    expect(contractSource).not.toMatch(/from\("sales_quotes"\)[\s\S]{0,200}update\(\{\s*status:\s*"sold"/);
  });

  it("preserves the canonical V1 customer-contract and downstream CRM bridge", () => {
    expect(serverWorkflowSource).toContain('return "v1"');
    expect(serverWorkflowSource).toContain("mirrorSalesQuoteForCustomerSend");
    expect(serverWorkflowSource).toContain('advanceQuoteStatus(supabase, crmQuoteId, "sold", actor)');
    expect(serverWorkflowSource).toContain("ensureTechnicalMeasureForm");
  });
});
