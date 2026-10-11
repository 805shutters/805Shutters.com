"use client";
import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { PhoneMessage } from "@/app/crm/phone/phone-desk";
export function PhoneCustomerMessages({
  messages,
  session,
  onOpenCallCenter,
}: {
  messages: PhoneMessage[];
  session: Session | null;
  onOpenCallCenter?: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function resolve(message: PhoneMessage) {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/crm/phone/messages/${message.id}/followup`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: message.status === "resolved" ? "open" : "resolved",
            note: message.followupNote || "",
          }),
        },
      );
      if (!response.ok) throw new Error("Message status could not be updated.");
      window.dispatchEvent(new Event("805-phone-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!messages.length) return null;
  return (
    <div className="crm-customer-phone-messages">
      <strong>Call Center messages</strong>
      {messages.map((m) => (
        <div
          key={m.id}
          className="my-3 rounded border border-slate-300 bg-white p-3"
        >
          <strong>
            {m.kind === "sms" ? "Incoming text: " : ""}
            {m.name}
          </strong>
          <p>
            {m.callback} · {m.status}
          </p>
          <p className="whitespace-pre-wrap">{m.text}</p>
          {m.confirmed === false && (
            <p>Incomplete message — caller did not confirm these details.</p>
          )}
          {m.followupNote && <p>Follow-up: {m.followupNote}</p>}
          <button type="button" disabled={busy} onClick={() => void resolve(m)}>
            {m.status === "resolved" ? "Reopen" : "Mark resolved"}
          </button>
          <button type="button" onClick={onOpenCallCenter}>
            Open Call Center
          </button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
