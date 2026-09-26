import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import "@/components/crm/crm-platinum.css";
import { OperationsDashboard } from "@/components/crm/OperationsOverview";
import type { CrmDashboardData, CrmQuote } from "@/lib/crm/types";
const amounts = [53000, 18000, 20000, 21416.73];
const quotes = ["2025-12-31", "2026-01-01", "2026-09-20", "2026-09-25"].map((day, i) => ({id:`sample-${i}`,job_id:`job-${i}`,customer_name:`Sample ${i}`,status:"sold",signed_at:`${day}T18:00:00Z`,quote_total:amounts[i],meta:{}} as CrmQuote));
const weeks = Array.from({length:39}, (_, i) => {
  const start = new Date(new Date("2026-09-21T12:00:00Z").getTime() - i * 7 * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  const sales = quotes.filter(q => q.signed_at!.slice(0,10) >= start.toISOString().slice(0,10) && q.signed_at!.slice(0,10) <= end.toISOString().slice(0,10)).map(q => ({id:q.id,signedAt:q.signed_at,amountCents:Math.round(q.quote_total*100),customerName:q.customer_name,reference:q.id}));
  return {startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),totalCents:sales.reduce((sum,s)=>sum+s.amountCents,0),sales};
});
const data = {jobs:[],quotes:[],bookkeepingRows:[],customerFiles:[],customerProducts:[],customerContracts:[],orderCogsEmails:[],installationInvoiceEmails:[],bookkeepingPayments:[],closedSales:{latestWeekStart:"2026-09-21",weeks,review:[]}} as unknown as CrmDashboardData;
if (new URLSearchParams(location.search).has("unavailable")) data.closedSales = undefined;
createRoot(document.getElementById("root")!).render(<main className="crm-platinum-shell" style={{display:"block",padding:20}}><OperationsDashboard data={data} busy={false} onOpen={()=>{}} /></main>);
