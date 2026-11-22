import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import "@/components/crm/crm-platinum.css";
import { UnifiedActivityFeed } from "@/components/crm/UnifiedActivityFeed";
import type { CrmActivitySnapshot } from "@/lib/crm/types";
const event = (id: string, day: string) => ({ id, created_at: `2026-11-${day}T18:00:00Z`, actor_email: "office@example.com", entity_type: "job", entity_id: id, action: "updated", before_data: null, after_data: { customer_name: "Preview customer", status: "scheduled" }, metadata: { customer_name: "Preview customer" } });
function Preview() {
  const [snapshot, setSnapshot] = useState<CrmActivitySnapshot>({ activityEvents: [event("new", "22")], payments: [], signedContracts: [], activityPage: { events: { at: "2026-11-22T18:00:00Z", id: "00000000-0000-0000-0000-000000000001" }, businessEvents: null } });
  return <main className="crm-platinum-shell" style={{ display: "block", padding: 24 }}><h1>CRM activity preview</h1><p style={{ marginBottom: 24 }}>Demonstration data · Review the “Load older activity” control. No customer records are changed.</p><div className="crm-platinum-content"><section className="crm-workspace"><UnifiedActivityFeed snapshot={snapshot} jobs={[]} quotes={[]} rows={[]} customers={[]} customerFiles={[]} onOpenCustomer={()=>{}} onLoadOlder={()=>setSnapshot({ ...snapshot, activityEvents: [...snapshot.activityEvents, event("older", "21")], activityPage: { events: null, businessEvents: null } })}/></section></div></main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
