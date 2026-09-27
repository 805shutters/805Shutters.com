import { createRoot } from "react-dom/client";
import { ContractsWorkspace } from "@/components/crm/ContractsWorkspace";
import type { CrmDashboardData } from "@/lib/crm/types";
import "@/app/globals.css";
import "@/components/crm/crm-platinum.css";

// Synthetic data only: manufacturer documents must never become customer contracts.
const data = {
  quotes: [{ id: "sample", quote_number: "805-SAMPLE", customer_name: "Ruth Sample", share_token: "fixture-customer-contract", signed_at: "2026-09-22", meta: {} }],
  customerContracts: [{ id: "packet", quote_id: "sample", title: "Agentic Order Packet", contract_url: "/api/crm/vendor-order-packets/sample", signed_at: "2026-09-22", meta: { source: "manufacturer_order_manifest" } }],
  customerFiles: [], customers: [], jobs: [], bookkeepingRows: [],
} as unknown as CrmDashboardData;

createRoot(document.getElementById("root")!).render(<main className="crm-platinum-shell" style={{ display: "block", padding: 20, minHeight: "100vh" }}><ContractsWorkspace data={data} busy={false} /></main>);
