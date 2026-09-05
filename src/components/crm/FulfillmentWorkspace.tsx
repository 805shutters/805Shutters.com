"use client";
import { useState, useRef, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  deriveFulfillment,
  type FulfillmentData,
  type FulfillmentScope,
  type FulfillmentLine,
  type ServiceVisit,
} from "@/lib/crm/fulfillment";
import type { JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import type { CrmCalendarEvent } from "@/lib/crm/types";
import type { InstallerOutcomeEvidence } from "@/lib/crm/job-progress";
import styles from "./JobTrackingWorkspace.module.css";
export type FulfillmentChange = {
  kind: "line" | "movement" | "visit";
  id: string;
  requestId: string;
  expectedRevision: number;
  payload: Record<string, unknown>;
};
export function FulfillmentWorkspace({
  item,
  data,
  events,
  reports,
  actions,
  onClose,
  onScope,
  onSave,
}: {
  item: JobTrackingViewItem;
  data: FulfillmentData;
  events: CrmCalendarEvent[];
  reports: InstallerOutcomeEvidence[];
  actions: import("@/lib/crm/owned-actions").OwnedAction[];
  onClose: () => void;
  onScope: (id: string) => Promise<FulfillmentScope>;
  onSave: (change: FulfillmentChange) => Promise<void>;
}) {
  const quoteId = item.progress.identity.quoteId!,
    jobId = item.progress.identity.jobId!;
  const view = deriveFulfillment(
    data,
    quoteId,
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
    }).format(new Date()),
  );
  const [scope, setScope] = useState<FulfillmentScope | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<{
      kind: FulfillmentChange["kind"];
      id: string;
      record?: FulfillmentLine | ServiceVisit;
      lineId?: string;
      remakeOf?: string;
      requestId: string;
    } | null>(null);
  const lock = useRef(false);
  async function edit(
    kind: FulfillmentChange["kind"],
    record?: FulfillmentLine | ServiceVisit,
    lineId?: string,
    remakeOf?: string,
  ) {
    setError("");
    setBusy(true);
    try {
      if (kind === "line") setScope(await onScope(quoteId));
      setEditor({
        kind,
        id: record?.id || crypto.randomUUID(),
        record,
        lineId,
        remakeOf,
        requestId: crypto.randomUUID(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purchased scope unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor || lock.current) return;
    const form = new FormData(e.currentTarget),
      p: Record<string, unknown> = { quote_id: quoteId, job_id: jobId };
    for (const [key, value] of form) p[key] = String(value);
    if (editor.kind === "line") {
      p.quantity = Number(p.quantity);
      p.remake_of =
        editor.remakeOf ||
        (editor.record as FulfillmentLine)?.remake_of ||
        null;
    }
    if (editor.kind === "movement") {
      p.quantity = Number(p.quantity);
      p.line_id = editor.lineId;
    }
    if (editor.kind === "visit") {
      p.affected_line_ids = form.getAll("affected_line_ids").map(String);
      const report = reports.find((r) => r.id === p.installer_form_id);
      p.report_revision =
        (report?.meta?.workflow as { revision?: number })?.revision || null;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave({
        kind: editor.kind,
        id: editor.id,
        expectedRevision: editor.record?.revision || 0,
        requestId: editor.requestId,
        payload: p,
      });
      setEditor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Record not saved.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const line =
    editor?.kind === "line"
      ? (editor.record as FulfillmentLine | undefined)
      : undefined;
  const visit =
    editor?.kind === "visit"
      ? (editor.record as ServiceVisit | undefined)
      : undefined;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.modal}
          style={{ maxWidth: 1000 }}
          aria-describedby="fulfillment-description"
        >
          <Dialog.Title>
            {item.customerName} · Orders, receipts & visits
          </Dialog.Title>
          <p id="fulfillment-description">
            {item.project} · Physical evidence for this purchased order. A
            shipment notice does not establish physical receipt.
          </p>
          {error && <p role="alert">{error}</p>}
          {!editor ? (
            <>
              <p>
                {view.scope
                  ? `${view.missingScope} purchased openings not registered; ${view.remaining} units still needed.`
                  : "Purchased quantities have not been registered. Complete receipt needs verification."}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => edit("line")}
              >
                Register purchased opening
              </button>{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => edit("visit")}
              >
                Record service / visit
              </button>
              <div style={{ overflowX: "auto" }}>
                <table aria-label="Purchased opening fulfillment">
                  <thead>
                    <tr>
                      <th>Opening / vendor</th>
                      <th>Order</th>
                      <th>Physical quantities</th>
                      <th>Promise / hold</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((r) => (
                      <tr key={r.line.id}>
                        <td>
                          {r.line.room} · {r.line.vendor_name}
                          {r.line.remake_of && (
                            <small>Remake of {r.line.remake_of}</small>
                          )}
                        </td>
                        <td>
                          {r.line.vendor_order_ref || "Reference missing"} ·{" "}
                          {r.line.state}
                        </td>
                        <td>
                          {r.line.quantity} needed · {r.shipped} shipped ·{" "}
                          {r.received} received · {r.damaged} damaged ·{" "}
                          {r.returned} usable returned · {r.replacementUsable}{" "}
                          replacement units · {r.remaining} remaining
                        </td>
                        <td>
                          Original {r.line.original_promised_on || "Unknown"}
                          <br />
                          Latest {r.line.promised_on || "Date missing"} ·{" "}
                          {r.delay}
                          {r.line.hold_reason && (
                            <p>
                              Hold: {r.line.hold_reason} · since{" "}
                              {r.line.hold_since?.slice(0, 10) || "Unknown"}
                            </p>
                          )}
                        </td>
                        <td>
                          <button onClick={() => edit("line", r.line)}>
                            Edit order / promise
                          </button>
                          <button
                            onClick={() =>
                              edit("movement", undefined, r.line.id)
                            }
                          >
                            Record product movement
                          </button>
                          <button
                            onClick={() =>
                              edit("line", undefined, r.line.id, r.line.id)
                            }
                          >
                            Record remake order
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Visits and service history</h3>
              {data.visits
                .filter((v) => v.quote_id === quoteId)
                .map((v) => (
                  <p key={v.id}>
                    {v.outcome} · {v.owner} · {v.reason} ·{" "}
                    {v.calendar_event_id
                      ? "Appointment linked"
                      : "Appointment not linked"}{" "}
                    ·{" "}
                    {v.installer_form_id
                      ? `Report revision ${v.report_revision}`
                      : "Report not linked"}
                    {v.resolution && ` · Resolution: ${v.resolution}`}{" "}
                    <button onClick={() => edit("visit", v)}>
                      Review visit
                    </button>
                  </p>
                ))}
              <details>
                <summary>Physical evidence and corrections</summary>
                {data.movements
                  .filter((m) => view.rows.some((r) => r.line.id === m.line_id))
                  .map((m) => (
                    <p key={m.id}>
                      {m.occurred_on} · {m.kind} {m.quantity} · {m.evidence}
                      {m.carrier_reference && ` · ${m.carrier_reference}`}
                      {m.correction_of && ` · Corrects ${m.correction_of}`}
                    </p>
                  ))}
              </details>
              <Dialog.Close>Close</Dialog.Close>
            </>
          ) : (
            <form
              className={styles.form}
              onSubmit={submit}
              key={editor.requestId}
            >
              <h3>
                {editor.kind === "line"
                  ? "Order / promise"
                  : editor.kind === "movement"
                    ? "Physical product movement"
                    : "Service / visit"}
              </h3>
              {editor.kind === "line" && (
                <>
                  <label>
                    Purchased opening
                    <select
                      name="source_line_id"
                      defaultValue={
                        line?.source_line_id ||
                        data.lines.find((l) => l.id === editor.remakeOf)
                          ?.source_line_id ||
                        ""
                      }
                      required
                    >
                      {scope?.lines
                        .filter((s) => !line || s.id === line.source_line_id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.room} · {s.quantity} purchased
                          </option>
                        ))}
                    </select>
                  </label>
                  {editor.remakeOf || line?.remake_of ? (
                    <label>
                      Remake quantity
                      <input
                        type="number"
                        name="quantity"
                        min="1"
                        step="1"
                        defaultValue={line?.quantity || 1}
                        required
                      />
                    </label>
                  ) : (
                    <input
                      type="hidden"
                      name="quantity"
                      value={line?.quantity || 0}
                    />
                  )}
                  <label>
                    Vendor
                    <input
                      name="vendor_name"
                      defaultValue={line?.vendor_name || item.vendor || ""}
                      required
                    />
                  </label>
                  <label>
                    Vendor order reference
                    <input
                      name="vendor_order_ref"
                      defaultValue={line?.vendor_order_ref || ""}
                    />
                  </label>
                  <label>
                    Order evidence state
                    <select
                      name="state"
                      defaultValue={line?.state || "unprepared"}
                    >
                      <option value="unprepared">Unprepared / review</option>
                      <option value="submitted">Submission recorded</option>
                      <option value="acknowledged">
                        Vendor acknowledgement recorded
                      </option>
                      <option value="canceled">
                        Vendor cancellation recorded
                      </option>
                    </select>
                  </label>
                  <label>
                    Latest confirmed promise
                    <input
                      name="promised_on"
                      type="date"
                      defaultValue={line?.promised_on || ""}
                    />
                  </label>
                  <label>
                    Hold / delay reason
                    <input
                      name="hold_reason"
                      defaultValue={line?.hold_reason || ""}
                    />
                  </label>
                </>
              )}
              {editor.kind === "movement" && (
                <>
                  <label>
                    Movement
                    <select name="kind" defaultValue="received">
                      <option value="received">Physically received</option>
                      <option value="shipped">Shipment evidenced</option>
                      <option value="damaged">Damaged received product</option>
                      <option value="returned">Returned usable product</option>
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      name="quantity"
                      type="number"
                      min="0"
                      step="1"
                      required
                    />
                  </label>
                  <label>
                    Actual business date
                    <input name="occurred_on" type="date" required />
                  </label>
                  <label>
                    Supporting document or observation
                    <textarea name="evidence" required />
                  </label>
                  <label>
                    Carrier / tracking reference
                    <input name="carrier_reference" />
                  </label>
                  <label>
                    Correct earlier evidence
                    <select name="correction_of" defaultValue="">
                      <option value="">New evidence</option>
                      {data.movements
                        .filter(
                          (m) =>
                            m.line_id === editor.lineId &&
                            !data.movements.some(
                              (c) => c.correction_of === m.id,
                            ),
                        )
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.occurred_on} · {m.kind} {m.quantity}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              {editor.kind === "visit" && (
                <>
                  <label>
                    Owner
                    <input
                      name="owner"
                      defaultValue={visit?.owner || "Mike"}
                      required
                    />
                  </label>
                  <label>
                    Visit outcome
                    <select
                      name="outcome"
                      defaultValue={visit?.outcome || "planned"}
                    >
                      <option value="planned">Planned</option>
                      <option value="partial">Partial / unresolved</option>
                      <option value="complete">
                        Complete, report verified
                      </option>
                      <option value="canceled">Canceled</option>
                    </select>
                  </label>
                  <label>
                    Installation appointment
                    <select
                      name="calendar_event_id"
                      defaultValue={visit?.calendar_event_id || ""}
                    >
                      <option value="">Not linked / scheduling needed</option>
                      {events
                        .filter(
                          (e) =>
                            e.job_id === jobId && e.event_type === "install",
                        )
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.start_at} · {e.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Installer report
                    <select
                      name="installer_form_id"
                      defaultValue={visit?.installer_form_id || ""}
                    >
                      <option value="">Not linked</option>
                      {reports
                        .filter((r) => r.quote_id === quoteId)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.status} · {r.signed_at || "Not submitted"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Original visit
                    <select
                      name="original_visit_id"
                      defaultValue={visit?.original_visit_id || ""}
                    >
                      <option value="">First recorded visit</option>
                      {data.visits
                        .filter(
                          (v) => v.quote_id === quoteId && v.id !== editor.id,
                        )
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.created_at.slice(0, 10)} · {v.reason}
                          </option>
                        ))}
                    </select>
                  </label>
                  <fieldset>
                    <legend>Affected purchased openings</legend>
                    {view.rows.map((r) => (
                      <label key={r.line.id}>
                        <input
                          type="checkbox"
                          name="affected_line_ids"
                          value={r.line.id}
                          defaultChecked={visit?.affected_line_ids.includes(
                            r.line.id,
                          )}
                        />
                        {r.line.room}
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    Office resolution
                    <textarea
                      name="resolution"
                      defaultValue={visit?.resolution || ""}
                    />
                  </label>
                  <label>
                    Service action
                    <select name="task_id" defaultValue={visit?.task_id || ""}>
                      <option value="">Not linked</option>
                      {actions
                        .filter((a) => a.quote_id === quoteId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title} · {a.status}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              <label>
                Evidence / reason for this change
                <textarea name="reason" required />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save operational evidence"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditor(null);
                  setError("");
                }}
              >
                Cancel edit
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
