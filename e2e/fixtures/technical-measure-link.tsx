import React from "react";
import { createRoot } from "react-dom/client";
import { JobStatusOverview } from "@/components/crm/OperationsOverview";
import type { CrmDashboardData } from "@/lib/crm/types";
import "@/app/globals.css";
const names = ["Completed Sample", "Draft Sample", "No Measure Sample"];
const data = { jobs: names.map((customer_name, i) => ({ id: `job-${i}`, customer_name, status: "sold", meta: i === 2 ? {} : { measure_needed: { status: i ? "needed" : "measured", form_status: i ? "draft" : "submitted", form_id: `measure-${i}` } } })),
quotes: names.map((customer_name, i) => ({ id: `quote-${i}`, job_id: `job-${i}`, customer_name, quote_number: `SAMPLE-${i}`, status: "sold", signed_at: "2026-10-17T12:00:00Z", sold_at: "2026-10-17T12:00:00Z", quote_total: 2000, balance_due: 1000, materials_cost: 500, meta: {} })),
bookkeepingRows: [], customerFiles: [], customerProducts: [], bookkeepingPayments: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData;
createRoot(document.getElementById("root")!).render(<main style={{padding: 20}}><JobStatusOverview data={data} busy={false} onOpen={() => {}} onAction={async () => {}} onSaveCost={async () => true} /></main>);
