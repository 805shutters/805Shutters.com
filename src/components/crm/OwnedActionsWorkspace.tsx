"use client";
import { useState, useRef, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { OwnedAction, OwnedActionChange } from "@/lib/crm/owned-actions";
import type { JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import styles from "./JobTrackingWorkspace.module.css";
const date = (d: string | null | undefined) => (d ? d.slice(0, 10) : "Unknown");
export function OwnedActionsWorkspace({
  items,
  actions,
  busy,
  onSave,
  onFocus,
}: {
  items: JobTrackingViewItem[];
  actions: OwnedAction[];
  busy: boolean;
  onSave: (c: OwnedActionChange) => Promise<void>;
  onFocus: (item: JobTrackingViewItem) => void;
}) {
  const [editor, setEditor] = useState<{
      action: Partial<OwnedAction>;
      requestId: string;
    } | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [history, setHistory] = useState(false);
  const saveLock = useRef(false);
  const match = (a: Partial<OwnedAction>) =>
    items.find((i) =>
      a.quote_id
        ? i.progress.identity.quoteId === a.quote_id
        : a.bookkeeping_entry_id
          ? i.progress.identity.bookkeepingId === a.bookkeeping_entry_id
          : i.progress.identity.jobId === a.job_id,
    );
  const visible = actions
    .filter((a) => history || ["open", "blocked"].includes(a.status))
    .sort(
      (a, b) =>
        (a.status === "blocked" ? -1 : 0) - (b.status === "blocked" ? -1 : 0) ||
        (a.due_on || "9999").localeCompare(b.due_on || "9999"),
    );
  function edit(action: Partial<OwnedAction>) {
    setError("");
    setEditor({ action, requestId: crypto.randomUUID() });
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor || saveLock.current) return;
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) || "");
    const selected = items.find((i) => i.id === str("record"));
    const a = editor.action;
    const identity = a.id
      ? {
          job_id: a.job_id,
          quote_id: a.quote_id,
          bookkeeping_entry_id: a.bookkeeping_entry_id,
        }
      : {
          job_id: selected?.progress.identity.jobId,
          quote_id: selected?.progress.identity.quoteId,
          bookkeeping_entry_id: selected?.progress.identity.bookkeepingId,
        };
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave({
        id: a.id || editor.requestId,
        requestId: editor.requestId,
        expectedRevision: a.revision || 0,
        action: {
          ...identity,
          task_type: a.task_type,
          title: str("title"),
          owner: str("owner"),
          status: str("status") as OwnedAction["status"],
          due_on: str("due_on"),
          blocker: str("blocker"),
          resolution: str("resolution"),
          order_reference: str("order_reference"),
          notes: str("notes"),
          change_reason: str("change_reason"),
        },
      });
      setEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action was not saved.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  return (
    <section
      aria-label="Owned next actions"
      style={{
        border: "1px solid #d9d9d3",
        padding: 16,
        margin: "16px 0",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h3>
          Next actions ·{" "}
          {actions.filter((a) => ["open", "blocked"].includes(a.status)).length}{" "}
          open
        </h3>
        <button
          type="button"
          onClick={() => edit({ owner: "Mike", status: "open" })}
          disabled={busy}
        >
          Add internal action
        </button>
        <label>
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => setHistory(e.target.checked)}
          />{" "}
          Include resolved actions
        </label>
      </div>
      {!visible.length ? (
        <p>
          No {history ? "recorded" : "open owned"} actions. Legacy work remains
          visible in tracking; it has not been assigned automatically.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left" }}>
            <thead>
              <tr>
                <th>Job / order</th>
                <th>Action / blocker</th>
                <th>Owner</th>
                <th>Due / waiting since</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const i = match(a);
                return (
                  <tr key={a.id}>
                    <td>
                      <button type="button" onClick={() => i && onFocus(i)}>
                        {i
                          ? `${i.customerName} · ${i.project}`
                          : "Linked record unavailable"}
                      </button>
                    </td>
                    <td>
                      {a.title}
                      {a.blocker && (
                        <small style={{ display: "block", color: "#a43d32" }}>
                          {a.blocker}
                        </small>
                      )}
                      {a.resolution && (
                        <small style={{ display: "block" }}>
                          Resolution: {a.resolution}
                        </small>
                      )}
                    </td>
                    <td>{a.owner || "Unassigned"}</td>
                    <td>
                      Due {date(a.due_on || a.due_at)}
                      <small style={{ display: "block" }}>
                        Waiting since {date(a.waiting_since)}
                      </small>
                    </td>
                    <td>{a.status}</td>
                    <td>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => edit(a)}
                      >
                        Review action
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog.Root
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !saving) setEditor(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.modal}
            aria-describedby="owned-action-description"
          >
            <Dialog.Title>
              {editor?.action.id
                ? "Review internal action"
                : "Add internal action"}
            </Dialog.Title>
            <p id="owned-action-description">
              Record the next commitment. Saving this action does not send a
              message or submit a vendor order.
            </p>
            {editor && (
              <form
                className={styles.form}
                onSubmit={submit}
                key={editor.requestId}
                style={{ display: "grid", gap: 10 }}
              >
                {!editor.action.id && (
                  <label>
                    Exact job / order
                    <select name="record" required defaultValue="">
                      <option value="" disabled>
                        Choose a record
                      </option>
                      {items
                        .filter((i) => i.job || i.quote || i.row)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.customerName} · {i.project} ·{" "}
                            {i.progress.identity.quoteId || i.id}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label>
                  Next action
                  <input
                    name="title"
                    required
                    maxLength={300}
                    defaultValue={editor.action.title}
                  />
                </label>
                <label>
                  Owner
                  <input
                    name="owner"
                    required
                    defaultValue={editor.action.owner || "Mike"}
                  />
                </label>
                <label>
                  Due date
                  <input
                    name="due_on"
                    type="date"
                    defaultValue={editor.action.due_on || ""}
                  />
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={editor.action.status || "open"}
                  >
                    <option value="open">Open</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </label>
                <label>
                  Blocker
                  <input
                    name="blocker"
                    defaultValue={editor.action.blocker || ""}
                  />
                </label>
                <label>
                  Resolution
                  <textarea
                    name="resolution"
                    defaultValue={editor.action.resolution || ""}
                  />
                </label>
                <label>
                  Vendor order reference
                  <input
                    name="order_reference"
                    defaultValue={editor.action.order_reference || ""}
                  />
                </label>
                <label>
                  Staff notes
                  <textarea
                    name="notes"
                    defaultValue={editor.action.notes || ""}
                  />
                </label>
                {editor.action.id && (
                  <label>
                    Reason for this change
                    <textarea name="change_reason" required />
                  </label>
                )}
                {error && <p role="alert">{error}</p>}
                <div>
                  <button type="submit" disabled={saving || busy}>
                    {saving ? "Saving…" : "Save action"}
                  </button>{" "}
                  <Dialog.Close disabled={saving}>Cancel</Dialog.Close>
                </div>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
