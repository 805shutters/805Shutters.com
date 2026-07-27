import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(
  fileURLToPath(
    new URL("../components/crm/quote-builder/QuoteDashboard.tsx", import.meta.url),
  ),
  "utf8",
);
const tableSource = readFileSync(
  fileURLToPath(
    new URL("../components/crm/quote-builder/QuotesTable.tsx", import.meta.url),
  ),
  "utf8",
);
const crmAppSource = readFileSync(
  fileURLToPath(new URL("../../components/crm/CrmApp.tsx", import.meta.url)),
  "utf8",
);

describe("active quote route historical boundary", () => {
  it("keeps CRM source rows out of V2 and opens their original records", () => {
    expect(dashboardSource).toContain(
      "resolveCrmQuoteBuilderRoute(quote, localSalesQuoteIds)",
    );
    expect(dashboardSource).toContain(
      'sourceQuoteId: route.kind === "v2" ? route.salesQuoteId : null',
    );
    expect(dashboardSource).toContain(
      "onOpenCrmQuote?.(quote.id, tab)",
    );
    expect(dashboardSource).not.toContain("/v2-route");
    expect(dashboardSource).not.toContain("importCrmQuoteRoute");
    expect(tableSource).toContain(
      "V1 only — historical configuration not yet imported to V2",
    );
  });

  it("does not blindly treat CRM source-system UUIDs as local V2 quote IDs", () => {
    expect(crmAppSource).not.toContain("function linkedSalesQuoteId");
    expect(crmAppSource).toContain("else setBuilderQuoteId(quoteId)");
    expect(crmAppSource).not.toContain("readOnlyLegacyQuoteId");
  });

  it("verifies appointment quote targets before writing them to the V2 store", () => {
    const handler = dashboardSource.slice(
      dashboardSource.indexOf("const handleOpenDashboardAppointment"),
    );
    expect(dashboardSource).toContain(
      "if (!quotes.some((quote) => quote.id === appointment.quote_id))",
    );
    expect(handler.indexOf("if (appointment.crm_quote_id)")).toBeLessThan(
      handler.indexOf("if (appointment.quote_id)"),
    );
  });
});
