import { expect, it } from "vitest";
import { OPERATIONS_REPORT_GROUPS } from "./OperationsReports";
import { buildOperationsReports } from "@/lib/crm/operations-reports";
import { buildDashboardData } from "@/lib/crm/backend";

it("keeps every operational report reachable exactly once in the grouped navigation", () => {
  const data = buildDashboardData({ jobs: [], quotes: [], payments: [], events: [], customers: [], products: [], contracts: [], entries: [], credits: [], expenses: [], installationInvoiceEmails: [], kenPayments: [], openingBalance: 0, payoffTarget: 500000 });
  const reports = buildOperationsReports(data, {from: "2026-01-01", through: "2026-09-19", asOf: "2026-09-19T18:00:00Z"});
  const visibleIds = OPERATIONS_REPORT_GROUPS.flatMap(group => group.ids);
  expect(new Set(visibleIds).size).toBe(visibleIds.length);
  expect(visibleIds.sort()).toEqual(reports.map(report => report.id).sort());
  expect(OPERATIONS_REPORT_GROUPS.every(group => group.ids.length > 0)).toBe(true);
});
