import React from "react";
import { createRoot } from "react-dom/client";
import { JobStatusOverview } from "../../src/components/crm/OperationsOverview";
import type { CrmDashboardData, CrmQuote } from "../../src/lib/crm/types";
import "../../src/app/globals.css";

const quotes = [true, false].map((inHouse, index) => ({
  id: `quote-${index + 1}`, job_id: `job-${index + 1}`, quote_number: `LOCAL-000${index + 1}`,
  customer_name: inHouse ? "Three Payment Customer" : "Standard Payment Customer",
  status: "sold", sold_at: "2026-08-06T20:00:00Z", signed_at: "2026-08-06T20:00:00Z",
  created_at: "2026-08-06T20:00:00Z", updated_at: "2026-08-06T20:00:00Z",
  quote_total: inHouse ? 3000 : 2400, deposit_due: inHouse ? 1000 : 1200,
  balance_due: inHouse ? 2000 : 1200,
  meta: inHouse ? { adjustments: { paymentSchedule: "in_house_three_month_v1" } } : {},
})) as unknown as CrmQuote[];
const dashboard = { jobs: [], quotes, bookkeepingRows: [], customerFiles: [], customerProducts: [],
  customerContracts: [], calendarEvents: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData;
createRoot(document.getElementById("root")!).render(<main style={{ padding: 20, maxWidth: 1900, margin: "auto" }}>
  <JobStatusOverview data={dashboard} busy={false} onOpen={() => {}}
    onAction={async () => { throw new Error("A payment circle must use the installment receipt form."); }}
    onSaveCost={async () => true} />
</main>);
