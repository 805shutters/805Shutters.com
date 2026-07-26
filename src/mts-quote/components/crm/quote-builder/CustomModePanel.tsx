"use client";
import { useState } from "react";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function CustomModePanel({ lineItem, design }: { lineItem: SalesQuoteLineItem; design: SalesQuoteDesign }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [v, setV] = useState({ manufacturerCost:"",freightCost:"",otherCost:"",profitMode:"dollar",profitValue:"",finalSellPrice:"",roomName:lineItem.room_name||"",designName:design.variant||"",widthWhole:String(lineItem.width_whole||0),widthFraction:lineItem.width_fraction||"0",heightWhole:String(lineItem.height_whole||0),heightFraction:lineItem.height_fraction||"0" });
  const field=(key:keyof typeof v,label:string,type="text")=><label className="text-xs font-semibold text-slate-700">{label}<input type={type} value={v[key]} onChange={e=>setV({...v,[key]:e.target.value})} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm"/></label>;
  async function apply(){
    setBusy(true);setMessage("");
    try{
      const supabase=getSupabaseBrowserClient();
      if(!supabase) throw new Error("CRM connection is unavailable.");
      const {data:sessionData}=await supabase.auth.getSession();
      const {data:quote}=await supabase.from("sales_quotes").select("quote_v2_revision").eq("id",lineItem.quote_id).single();
      const response=await fetch(`/api/crm/sales-quotes/${lineItem.quote_id}/v2/custom-mode`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${sessionData.session?.access_token||""}`},body:JSON.stringify({lineItemId:lineItem.id,designId:design.id,expectedRevision:Number(quote?.quote_v2_revision||0),idempotencyKey:`custom-${design.id}-${Date.now()}`,...v})});
      const body=await response.json();if(!response.ok)throw new Error(body.message||"Custom Mode could not be saved.");
      setMessage("Custom override saved. Review the customer preview before requesting send approval.");
    }catch(error){setMessage(error instanceof Error?error.message:"Custom Mode could not be saved.");}finally{setBusy(false);}
  }
  return <div className="mt-3 rounded-lg border border-violet-300 bg-violet-50 p-3" data-testid="quote-v2-custom-mode">
    <button type="button" onClick={()=>setOpen(!open)} className="font-bold text-violet-950">{open?"Close Custom Mode":"Custom Mode — internal exception"}</button>
    {open&&<div className="mt-3 space-y-3"><p className="text-xs text-violet-900">Original V2 pricing and provenance remain immutable. Costs and margin never appear in customer outputs.</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{field("manufacturerCost","Manufacturer cost","number")}{field("freightCost","Freight cost","number")}{field("otherCost","Other cost","number")}
        <label className="text-xs font-semibold text-slate-700">Profit method<select value={v.profitMode} onChange={e=>setV({...v,profitMode:e.target.value})} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm"><option value="dollar">Profit dollars</option><option value="margin">Margin percent</option></select></label>
        {field("profitValue",v.profitMode==="margin"?"Margin %":"Profit $","number")}{field("finalSellPrice","Final sell price (optional)","number")}{field("roomName","Line name")}{field("designName","Option name")}{field("widthWhole","Width whole","number")}{field("widthFraction","Width fraction")}{field("heightWhole","Height whole","number")}{field("heightFraction","Height fraction")}
      </div><button type="button" disabled={busy} onClick={apply} className="rounded bg-violet-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?"Saving…":"Save internal override"}</button>{message&&<p className="text-xs font-semibold text-violet-950">{message}</p>}</div>}
  </div>;
}
