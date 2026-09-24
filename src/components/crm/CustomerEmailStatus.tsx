"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { customerEmailStatus, type CustomerEmailRecord } from "@/lib/crm/customer-email-status";
type Result = { messages?: CustomerEmailRecord[]; activation?: string | null; activated?: boolean; ok?: boolean; attention?: number; stale?: boolean; missing?: number; workerFailed?: boolean; providerConfigured?: boolean };
export function CustomerEmailStatus({ jobId }: { jobId?: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const client = getSupabaseBrowserClient();
      const session = client ? (await client.auth.getSession()).data.session : null;
      if (!session) throw new Error("Sign in to view customer email delivery.");
      const response = await fetch(`/api/crm/customer-email-status/${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Customer email status unavailable.");
      if (!signal?.aborted) { setResult(body); setError(""); }
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "Customer email status unavailable."); }
  }, [jobId]);
  useEffect(() => { setResult(null); const controller = new AbortController(); void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), 60000);
    return () => { controller.abort(); clearInterval(timer); }; }, [refresh]);
  return <section aria-label="Customer email delivery" style={{ padding: "12px 0", overflowWrap: "anywhere" }}>
    <h3>Customer emails</h3>
    {error ? <p role="alert">{error}</p> : !result ? <p>Loading email status…</p> : jobId ? <>
      {!result.messages?.length && <p>No automatic email is recorded for this job. New signing and final-payment events are tracked after activation; older missed messages are not sent.</p>}
      {result.messages?.map(message => <div key={message.id} style={{ marginBottom: 12 }}>
        <strong>{message.kind === "paid_in_full" ? "Paid-in-full thank-you & receipt" : "Signing thank-you & contract"}</strong>
        <p>{customerEmailStatus(message)} · {message.recipient || "Email missing"}</p>
        <small>Queued {new Date(message.created_at).toLocaleString()}{message.provider_accepted_at && ` · Accepted ${new Date(message.provider_accepted_at).toLocaleString()}`}{message.delivery_checked_at && ` · Delivery checked ${new Date(message.delivery_checked_at).toLocaleString()}`}</small>
        {(message.last_error || message.delivery_error) && <p role="alert">{message.last_error || message.delivery_error}</p>}
        {result.activation && Date.parse(message.created_at) < Date.parse(result.activation) && <p>Historical record · excluded from automatic retries.</p>}
      </div>)}
    </> : <p role={result.ok ? "status" : "alert"}>{!result.activated ? "Customer email automation is awaiting activation." : result.ok ? "Signing and paid-in-full email checks are current." : `${result.attention || 0} customer email(s) need attention. ${result.missing ? `${result.missing} new event(s) are missing an email request. ` : ""}${result.providerConfigured === false ? "The email provider is not configured. " : ""}${result.workerFailed ? "The latest email worker run failed. " : ""}${result.stale ? "The email worker has not checked in within 15 minutes." : "Open the customer’s job to review delivery details."}`}</p>}
    <button type="button" onClick={() => void refresh()}>Refresh email status</button>
  </section>;
}
