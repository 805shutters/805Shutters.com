import { useState } from "react";
import { createRoot } from "react-dom/client";
import { JobStatusOverview } from "@/components/crm/OperationsOverview";
import { buildActiveJobsSnapshot } from "@/lib/crm/active-jobs";
import type { CrmDashboardData, CrmJob, CrmQuote } from "@/lib/crm/types";
const jobs = ["Open sold", "Closed paid", "Reopened paid", "Unsold quote"].map((name, i) => ({
  id: `job-${i}`, customer_name: name, status: "quoted", created_at: "2026-09-01", updated_at: "2026-09-01",
  meta: i === 2 ? { job_closure_override: { closed: false } } : {}
} as unknown as CrmJob));
const quotes = jobs.map((job, i) => ({
  id: `quote-${i}`, job_id: job.id, customer_name: job.customer_name,
  status: i === 3 ? "sent" : "sold", quote_total: 1000, balance_due: i === 1 || i === 2 ? 0 : 1000,
  created_at: "2026-09-01", meta: {}
} as unknown as CrmQuote));
const full = { jobs, quotes, bookkeepingRows: [], customerProducts: [], customerFiles: [],
  orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData;
const active = buildActiveJobsSnapshot(full);
function Preview() {
  const [data, setData] = useState<CrmDashboardData | null>(null);
  const [fail, setFail] = useState(false);
  const [loads, setLoads] = useState(0);
  const [key, setKey] = useState(0);
  return <main style={{maxWidth:1500,margin:"24px auto",padding:16}}>
    <p>LOCAL TEST · SYNTHETIC JOBS · Full loads: {loads}</p>
    <label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/> Fail full load</label>
    <button onClick={()=>{setData(null);setLoads(0);setKey(key+1);}}>Reset test</button>
    <JobStatusOverview key={key} data={data} activeSnapshot={active} busy={false} onOpen={()=>{}} onAction={async()=>{}} onSaveCost={async()=>true}
      onLoadAll={async()=>{setLoads(n=>n+1);await new Promise(resolve=>setTimeout(resolve,350));if(fail)throw new Error("Test: jobs unavailable. Try again.");setData(full);return full;}}/>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
