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

describe("active quote route historical import guard", () => {
  it("resolves CRM source IDs against local sales quote rows before opening V2", () => {
    expect(dashboardSource).toContain(
      "resolveCrmQuoteBuilderRoute(quote, localSalesQuoteIds)",
    );
    expect(dashboardSource).toContain(
      'sourceQuoteId: route.kind === "v2" ? route.salesQuoteId : null',
    );
    expect(dashboardSource).toContain(
      "/api/crm/quotes/${encodeURIComponent(crmQuoteId)}/v2-route",
    );
    expect(dashboardSource).toContain('if (route.status !== "ready")');
  });

  it("opens the original CRM quote when V2 structural import is absent", () => {
    expect(dashboardSource).toContain(
      "Opening the original quote instead of an empty $0 V2 quote.",
    );
    expect(tableSource).toContain(
      "V1 only — historical configuration not yet imported to V2",
    );
  });

  it("does not blindly treat CRM source-system UUIDs as local V2 quote IDs", () => {
    expect(crmAppSource).not.toContain("function linkedSalesQuoteId");
    expect(crmAppSource).toContain(
      "Historical quote opened read-only because it is not structurally imported into V2.",
    );
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
