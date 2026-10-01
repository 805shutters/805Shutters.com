"use client";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {confirmationSample,confirmationSampleMedia} from "@/lib/booking/confirmation-sample";
export function ConfirmationSamplePanel() {
  const [result,setResult]=useState<Record<string,unknown>|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function request(method:"GET"|"POST") {
    setBusy(true);setError("");
    try {
      const session=await getSupabaseBrowserClient()?.auth.getSession();
      const token=session?.data.session?.access_token;
      if(!token) throw new Error("Sign in to the CRM first.");
      const response=await fetch("/api/crm/confirmation-sample/",{method,headers:{Authorization:`Bearer ${token}`}});
      const body=await response.json();
      if(!response.ok)throw new Error(body.message || "Sample request failed.");
      setResult(body);
    } catch(e) {setError(e instanceof Error?e.message:"Sample request failed.");}
    finally {setBusy(false);}
  }
  useEffect(()=>{void request("GET");},[]);
  const attempted=Boolean(result?.result);
  return <main style={{maxWidth:800,margin:"32px auto",padding:24,background:"#f8f6f0",color:"#152e40"}}>
    <h1>Appointment confirmation sample</h1>
    <p>To: 805-298-5555 · Sample only; no appointment is created.</p>
    <p>{confirmationSample.body}</p>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={confirmationSampleMedia[0]} alt="Sample appointment confirmation with Jessica" style={{width:"100%",maxWidth:440}} />
    <p><button disabled={busy||attempted} onClick={()=>void request("POST")}>Send sample confirmation</button> <button disabled={busy} onClick={()=>void request("GET")}>Refresh delivery status</button></p>
    {error&&<p role="alert">{error}</p>}
    {result&&<pre aria-label="Sample delivery result" style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(result,null,2)}</pre>}
  </main>;
}
