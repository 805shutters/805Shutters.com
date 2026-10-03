"use client";
import styles from "./InHousePayments.module.css";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  IN_HOUSE_SCHEDULE,
  IN_HOUSE_TERMS,
  scheduleAmounts,
  type PaymentSchedule,
} from "@/lib/crm/payment-schedule";
import {
  installmentStatus,
  unpaidCents,
  planDate,
  type PlanView,
} from "@/lib/crm/in-house-plan-model";
const money = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export async function inHouseRequest(
  url: string,
  method = "GET",
  body?: unknown,
) {
  const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data
    .session;
  if (!session) throw new Error("Sign in to the CRM first.");
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.message || data.error || "Payment schedule unavailable.",
    );
  return data;
}
export function PaymentScheduleSelector({
  value,
  total,
  disabled,
  onSave,
}: {
  value: PaymentSchedule;
  total: number;
  disabled?: boolean;
  onSave: (s: PaymentSchedule) => Promise<void>;
}) {
  const [choice, setChoice] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setChoice(value), [value]);
  const amounts = total >= 0.03 ? scheduleAmounts(total) : null;
  return (
    <section className={styles.panel} aria-label="Quote payment terms">
      <button
        type="button"
        className="rounded border px-4 py-2"
        disabled={disabled || busy}
        aria-pressed={choice === IN_HOUSE_SCHEDULE}
        onClick={() => setChoice(IN_HOUSE_SCHEDULE)}
      >
        In-house 3-month payments
      </button>
      {choice === IN_HOUSE_SCHEDULE && (
        <>
          <p>
            Deposit: {amounts ? money(amounts[0]) : "Total needed"} · Upon
            acceptance
            <br />
            Month 2: {amounts ? money(amounts[1]) : "—"} · 1 month after full
            deposit
            <br />
            Month 3: {amounts ? money(amounts[2]) : "—"} · 2 months after full
            deposit
          </p>
          <p className="text-sm">
            No added financing fees or interest. Customer-initiated payments.
            Monthly dates start when the full deposit is received.
          </p>
          <button
            type="button"
            className="underline"
            disabled={disabled || busy}
            onClick={() => setChoice("standard")}
          >
            Return to standard payments
          </button>
        </>
      )}
      {choice !== value && (
        <button
          type="button"
          disabled={busy || disabled || !amounts}
          className="rounded bg-black text-white px-4 py-2"
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onSave(choice);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Save failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save payment terms"}
        </button>
      )}
      {disabled && <p className="text-sm">Signed terms are preserved.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function InHousePayments({
  quoteId,
  salesQuoteId,
  initiallyOpen = false,
}: {
  quoteId?: string | null;
  salesQuoteId?: string | null;
  initiallyOpen?: boolean;
}) {
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [open, setOpen] = useState(initiallyOpen);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{
    id: string;
    fingerprint: string;
    messages: { channel: string; recipient: string | null; text: string }[];
  } | null>(null);
  const [receipt, setReceipt] = useState<{
    planId: string;
    installmentId: string;
    amount: string;
    day: string;
    method: string;
    requestId: string;
  } | null>(null);
  const refresh = async () => {
    const data = await inHouseRequest(
      `/api/crm/in-house-plans/${salesQuoteId ? `?salesQuoteId=${encodeURIComponent(salesQuoteId)}` : ""}`,
    );
    setPlans(
      quoteId
        ? data.plans.filter((p: PlanView) => p.quote_id === quoteId)
        : data.plans,
    );
  };
  useEffect(() => {
    if (open) {
      refresh().catch((e) => setError(e.message));
    }
    setReview(null);
  }, [open, quoteId, salesQuoteId]);
  const act = async (id: string, action: string) => {
    setBusy(true);
    setError("");
    try {
      await inHouseRequest("/api/crm/in-house-plans/", "PATCH", {
        id,
        action,
        reviewed: action === "resend",
        fingerprint: review?.fingerprint,
        requestId: crypto.randomUUID(),
      });
      setReview(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel} aria-label="In-house payment tracking">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        In-house payment tracking
      </button>
      {open && (
        <>
          {error && <p role="alert">{error}</p>}
          {!plans.length && !error && (
            <p>No accepted in-house plan for this view.</p>
          )}
          {plans.map((p) => (
            <article key={p.id} className="border-t py-3">
              <h4>
                {p.current.customerName} · {p.current.quoteNumber || "Quote"}
              </h4>
              <p>
                {p.status === "waiting_deposit"
                  ? "Waiting for full deposit"
                  : p.status}
                {p.review_reason ? ` · ${p.review_reason}` : ""}
                {p.processing_error ? ` · ${p.processing_error}` : ""}
              </p>
              {p.installments.map((i) => (
                <div key={i.id} className="border rounded p-3 my-2">
                  <strong>
                    Payment {i.number} of 3 ·{" "}
                    {i.number === 1 ? "Deposit" : `Month ${i.number}`}
                  </strong>
                  <p>
                    Scheduled: {money(i.amount_cents)} · Received:{" "}
                    {money(i.paid_cents)} · Remaining: {money(unpaidCents(i))}
                    <br />
                    Due:{" "}
                    {i.due_date ||
                      `${i.number - 1} calendar month${i.number === 3 ? "s" : ""} after full deposit`}{" "}
                    · {installmentStatus(i)}
                    <br />
                    Receipt date: {i.paid_at || "—"} · Method:{" "}
                    {i.payment_method || "—"}
                  </p>
                  {unpaidCents(i) > 0 && p.status !== "cancelled" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setReceipt({
                          planId: p.id,
                          installmentId: i.id,
                          amount: (unpaidCents(i) / 100).toFixed(2),
                          day: planDate(),
                          method: "zelle",
                          requestId: crypto.randomUUID(),
                        })
                      }
                    >
                      Record received payment {i.number}
                    </button>
                  )}
                </div>
              ))}
              {receipt?.planId === p.id && (
                <form
                  className="border rounded p-3 space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    try {
                      const result = await inHouseRequest(
                        `/api/crm/in-house-plans/${p.id}/receipt/`,
                        "POST",
                        {
                          ...receipt,
                          amount: Number(receipt.amount),
                          receiptDate: receipt.day,
                        },
                      );
                      setReceipt(null);
                      await refresh();
                      if (result.warning) setError(result.warning);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Receipt failed",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <p>
                    Record money already received. This does not charge a card.
                  </p>
                  <label className="block">
                    Amount received{" "}
                    <input
                      className="border p-2"
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={receipt.amount}
                      onChange={(e) =>
                        setReceipt({ ...receipt, amount: e.target.value })
                      }
                    />
                  </label>
                  <label className="block">
                    Actual receipt date (Los Angeles){" "}
                    <input
                      className="border p-2"
                      type="date"
                      required
                      max={planDate()}
                      value={receipt.day}
                      onChange={(e) =>
                        setReceipt({ ...receipt, day: e.target.value })
                      }
                    />
                  </label>
                  <label className="block">
                    Method{" "}
                    <select
                      className="border p-2"
                      value={receipt.method}
                      onChange={(e) =>
                        setReceipt({ ...receipt, method: e.target.value })
                      }
                    >
                      {["zelle", "cash", "check", "credit_card", "other"].map(
                        (m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <button disabled={busy} type="submit">
                    Save received payment
                  </button>{" "}
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => setReceipt(null)}
                  >
                    Cancel receipt
                  </button>
                </form>
              )}
              <div className="flex flex-wrap gap-3">
                {["pause", "resume", "cancel"].map((a) => (
                  <button
                    type="button"
                    key={a}
                    disabled={
                      busy || ["completed", "cancelled"].includes(p.status)
                    }
                    onClick={() => act(p.id, a)}
                  >
                    {a[0].toUpperCase() + a.slice(1)}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy || p.status !== "active"}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setReview(
                        await inHouseRequest(
                          "/api/crm/in-house-plans/",
                          "POST",
                          { id: p.id },
                        ),
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Preview failed",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Review reminder resend
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => refresh().catch((e) => setError(e.message))}
                >
                  Refresh receipts
                </button>
              </div>
              {review?.id === p.id && (
                <div className="border rounded p-3">
                  <h5>Review recipients and exact reminders</h5>
                  {review.messages.map((m, n) => (
                    <p key={n}>
                      {m.channel}: {m.recipient || "Missing contact"}
                      <br />
                      {m.text}
                    </p>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(p.id, "resend")}
                  >
                    Confirm & resend reviewed reminders
                  </button>
                  <button type="button" onClick={() => setReview(null)}>
                    Close
                  </button>
                </div>
              )}
              {p.notifications.length > 0 && (
                <details>
                  <summary>Reminder delivery</summary>
                  {p.notifications.map((n) => (
                    <p key={n.id}>
                      {n.event_key} · {n.channel} ·{" "}
                      {n.recipient || "Missing contact"} · {n.status}
                      {n.error ? ` · ${n.error}` : ""}
                      {n.provider_id ? ` · ${n.provider_id}` : ""}
                    </p>
                  ))}
                </details>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
export function SchedulePreview({ total }: { total: number }) {
  const amounts = total >= 0.03 ? scheduleAmounts(total) : [0, 0, 0];
  return (
    <section aria-label="Three-payment schedule" className={styles.panel}>
      <strong>{IN_HOUSE_TERMS.heading}</strong>
      <p>
        Deposit: {money(amounts[0])}, upon acceptance
        <br />
        Month 2: {money(amounts[1])}, one calendar month after full deposit
        <br />
        Month 3: {money(amounts[2])}, two calendar months after full deposit
      </p>
    </section>
  );
}
