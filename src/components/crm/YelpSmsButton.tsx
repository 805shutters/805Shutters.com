"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import { yelpSmsBody, yelpSmsPhone, type YelpSmsStatus } from "@/lib/crm/yelp-sms-shared";
import styles from "./YelpSmsButton.module.css";

type State = { ready: boolean; statuses: Record<string, YelpSmsStatus>; send: (item: JobTrackingViewItem) => Promise<void> };
const YelpSmsContext = createContext<State | null>(null);

export function YelpSmsProvider({ accessToken, children }: { accessToken: string; children: ReactNode }) {
  const [statuses, setStatuses] = useState<Record<string, YelpSmsStatus>>({});
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(new Set<string>());
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    fetch("/api/crm/yelp-sms", { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Yelp text history is unavailable. Refresh before sending.");
        const data = await response.json() as { statuses: YelpSmsStatus[] };
        if (!controller.signal.aborted) {
          setStatuses(Object.fromEntries(data.statuses.map(status => [status.phone, status])));
          setReady(true);
        }
      }).catch(() => { if (!controller.signal.aborted) setError("Yelp text history is unavailable. Refresh before sending."); });
    return () => controller.abort();
  }, [accessToken]);

  async function send(item: JobTrackingViewItem) {
    const phone = yelpSmsPhone(item.phone);
    if (!ready || !phone || statuses[phone] || pending.current.has(phone)) return;
    pending.current.add(phone);
    setNotice(""); setError("");
    setStatuses(previous => ({ ...previous, [phone]: { phone, status: "sending", attemptedAt: new Date().toISOString() } }));
    try {
      const response = await fetch("/api/crm/yelp-sms", { method: "POST", headers: {
        Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json"
      }, body: JSON.stringify({ itemId: item.id, expectedPhone: phone }) });
      const result = await response.json() as YelpSmsStatus & { duplicate?: boolean; warning?: string; message?: string };
      if (!response.ok) throw new Error(result.message || "The Yelp text could not be sent.");
      setStatuses(previous => ({ ...previous, [phone]: result }));
      if (result.warning || result.status === "needs_review") setError(result.warning || "This number already has a Yelp text attempt. Check the SMS log before resending.");
      else setNotice(result.duplicate ? `Yelp link already sent to ${item.customerName}; no duplicate text sent.`
        : `Yelp text accepted for sending to ${item.customerName} at ${phone}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Yelp text outcome is uncertain. Refresh and check the SMS log.");
      // Read before allowing any retry after a timeout or lost response.
      try {
        const response = await fetch("/api/crm/yelp-sms", { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!response.ok) throw new Error("History unavailable");
        const data = await response.json() as { statuses: YelpSmsStatus[] };
        setStatuses(Object.fromEntries(data.statuses.map(status => [status.phone, status])));
      } catch {
        setStatuses(previous => ({ ...previous, [phone]: { phone, status: "needs_review", attemptedAt: new Date().toISOString() } }));
        setReady(false);
      }
    } finally { pending.current.delete(phone); }
  }
  return <YelpSmsContext.Provider value={{ ready, statuses, send }}>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {children}
  </YelpSmsContext.Provider>;
}

export function YelpSmsButton({ item, busy = false }: { item: JobTrackingViewItem; busy?: boolean }) {
  const context = useContext(YelpSmsContext);
  const phone = yelpSmsPhone(item.phone);
  const status = phone ? context?.statuses[phone] : undefined;
  const reason = !phone ? "Add a valid customer cell number first." : status?.status === "accepted"
    ? `Yelp text accepted for sending on ${new Date(status.attemptedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}.`
    : status?.status === "needs_review" ? "Previous text attempt needs review. Check the SMS log before resending."
    : status?.status === "sending" ? "Sending Yelp link…" : !context?.ready ? "Loading Yelp text history…"
    : `Text ${item.customerName} at ${phone}: ${yelpSmsBody(item.customerName)}`;
  return <button type="button" className={styles.button} disabled={busy || !phone || !context?.ready || Boolean(status)}
    title={reason} aria-label={`Text Yelp link to ${item.customerName}${status?.status === "accepted" ? "; already sent" : ""}`}
    onClick={() => void context?.send(item)}>
    Yelp{status?.status === "accepted" && <Check size={11} aria-hidden="true" />}{status?.status === "sending" && "…"}
  </button>;
}
