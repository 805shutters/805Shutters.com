import type { CrmActivityEvent } from "./types";
export function businessEventToActivity(
  row: Record<string, unknown>,
): CrmActivityEvent {
  const before = (row.before_data || {}) as Record<string, unknown>,
    after = (row.after_data || {}) as Record<string, unknown>,
    meta = (row.metadata || {}) as Record<string, unknown>;
  const changes: string[] = [];
  if (row.event_type === "task_changed") {
    changes.push(String(after.title || "Internal action"));
    for (const [key, label] of [
      ["due_on", "Due date"],
      ["owner", "Owner"],
      ["status", "Status"],
    ] as const)
      if (before[key] !== after[key])
        changes.push(
          `${label}: ${before[key] || "not recorded"} → ${after[key] || "not recorded"}`,
        );
    if (meta.reason) changes.push(`Reason: ${meta.reason}`);
    if (after.resolution) changes.push(`Resolution: ${after.resolution}`);
  } else if (row.event_type === "purchased_scope_verified") {
    changes.push(`Purchased scope verified · revision ${row.source_revision}`);
  } else if (String(row.event_type).startsWith("fulfillment_")) {
    changes.push(String(row.event_type).replaceAll("_", " "));
    for (const key of [
      "room",
      "vendor_order_ref",
      "promised_on",
      "state",
      "hold_reason",
      "owner",
      "outcome",
    ] as const)
      if (before[key] !== after[key])
        changes.push(
          `${key.replaceAll("_", " ")}: ${before[key] || "not recorded"} → ${after[key] || "not recorded"}`,
        );
    if (after.kind)
      changes.push(
        `${after.kind}: ${after.quantity} · ${after.occurred_on} · ${after.evidence}`,
      );
    if (after.correction_of) changes.push(`Corrects: ${after.correction_of}`);
    if (meta.reason) changes.push(`Reason: ${meta.reason}`);
  } else {
    const wf = (after.workflow || {}) as Record<string, unknown>;
    changes.push(
      `Installation report revision ${row.source_revision}: ${wf.outcome || "outcome unavailable"}`,
    );
    if (wf.reasonCode) changes.push(`Reason: ${wf.reasonCode}`);
  }
  return {
    id: String(row.id),
    created_at: String(row.occurred_at || row.created_at),
    actor_email: String(row.actor || "system"),
    entity_type: String(row.source_table),
    entity_id: String(row.source_id),
    action: String(row.event_type),
    before_data: before,
    after_data: after,
    metadata: {
      business_event_id: row.id,
      job_id: row.job_id,
      quote_id: row.quote_id,
      bookkeeping_entry_id: row.bookkeeping_entry_id,
      correlation_id: row.correlation_id,
      source_revision: row.source_revision,
      recorded_at: row.created_at,
      date_precision: row.date_precision,
      description: changes.join(" · "),
    },
  };
}
