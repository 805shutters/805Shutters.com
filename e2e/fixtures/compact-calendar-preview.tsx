import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { StaffWeekCalendar } from "@/components/crm/StaffWeekCalendar";
import { zonedTimeToUtc } from "@/lib/booking/availability";
import type { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";
import "../../src/app/globals.css";

const at = (day: string, time: string) => zonedTimeToUtc(day, time).toISOString();
const sampleRanges = [21,22,23,24,25].map(day => ({ id:`sample-${day}`,owner:"Jessica",status:"available",source:"crm_working_ranges",start_at:at(`2026-09-${day}`,"10:00"),end_at:at(`2026-09-${day}`,"14:00") })) as CrmAvailabilitySlot[];
const sampleEvents = [{id:"sample-a",customer_name:"Jordan Lee",customer_city:"Camarillo",product_interest:"Shutters",start_at:at("2026-09-21","09:00"),end_at:at("2026-09-21","10:00"),status:"scheduled",event_type:"sales_consult"},{id:"sample-b",customer_name:"Casey Chen",customer_city:"Simi Valley",product_interest:"Measure",start_at:at("2026-09-23","09:30"),end_at:at("2026-09-23","10:30"),status:"scheduled",event_type:"measure"}] as CrmCalendarEvent[];
let ranges = sampleRanges;
let revision = 1;
// This fixture intercepts availability locally. It never connects to the CRM.
window.fetch = async (_input, init) => {
 if(init?.method === "PUT") {
  const body = JSON.parse(String(init.body));
  if(body.revision !== String(revision)) return new Response(JSON.stringify({message:"Sample revision conflict"}),{status:409});
  ranges = body.ranges.map((range: CrmAvailabilitySlot,index:number)=>({...range,id:`sample-${index}`,owner:"Jessica",status:"available",source:"crm_working_ranges"}));
  revision++;
 }
 return new Response(JSON.stringify({revision:String(revision),ranges}),{headers:{"Content-Type":"application/json"}});
};
function Preview() {
 const [date,setDate] = useState("2026-09-21");
 const [selection,setSelection] = useState("");
 return <main style={{padding:12,background:"#0b100d",minHeight:"100vh"}}><StaffWeekCalendar session={{access_token:"local-sample"} as Session} events={sampleEvents} jobs={[]} anchorDate={date} onDateChange={setDate} onSelectSlot={slot=>setSelection(JSON.stringify(slot))} onOpenEvent={event=>setSelection(event.customer_name || event.title)} onClose={()=>setSelection("Return to CRM")} />{selection && <div role="dialog" aria-label="Local selection result" style={{position:"fixed",inset:"30% 15% auto",padding:24,background:"#172a1f",border:"1px solid #72dcaf",borderRadius:12,color:"white",zIndex:10}}><p>LOCAL SAMPLE SELECTION</p><pre style={{whiteSpace:"pre-wrap"}}>{selection}</pre><button onClick={()=>setSelection("")}>Close sample selection</button></div>}</main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
