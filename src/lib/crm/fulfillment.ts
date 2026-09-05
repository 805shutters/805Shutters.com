/** Purchased scope and physical evidence only. Prices and receipts remain in their existing ledgers. */
export type FulfillmentScope = {
  quote_id: string;
  job_id: string;
  source_revision: string;
  lines: Array<{ id: string; room: string; quantity: number }>;
  verified_at: string;
};
export type FulfillmentLine = {
  id: string;
  quote_id: string;
  job_id: string;
  source_line_id: string;
  source_revision: string;
  room: string;
  quantity: number;
  vendor_name: string;
  vendor_order_ref: string;
  state: "unprepared" | "submitted" | "acknowledged" | "canceled";
  original_promised_on: string | null;
  promised_on: string | null;
  hold_reason: string | null;
  hold_since: string | null;
  remake_of: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type ProductMovement = {
  id: string;
  line_id: string;
  kind: "shipped" | "received" | "damaged" | "returned";
  quantity: number;
  occurred_on: string;
  evidence: string;
  carrier_reference: string | null;
  correction_of: string | null;
  reason: string;
  created_at: string;
};
export type ServiceVisit = {
  id: string;
  quote_id: string;
  job_id: string;
  task_id: string | null;
  calendar_event_id: string | null;
  installer_form_id: string | null;
  report_revision: number | null;
  affected_line_ids: string[];
  original_visit_id: string | null;
  reason: string;
  owner: string;
  outcome: "planned" | "partial" | "complete" | "canceled";
  resolution: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type FulfillmentData = {
  scopes: FulfillmentScope[];
  lines: FulfillmentLine[];
  movements: ProductMovement[];
  visits: ServiceVisit[];
};
export const emptyFulfillment: FulfillmentData = {
  scopes: [],
  lines: [],
  movements: [],
  visits: [],
};
export function deriveFulfillment(
  data: FulfillmentData,
  quoteId: string,
  asOf: string,
) {
  const scope = data.scopes.find((s) => s.quote_id === quoteId);
  const lines = data.lines.filter((l) => l.quote_id === quoteId);
  const superseded = new Set(
    data.movements.flatMap((m) => (m.correction_of ? [m.correction_of] : [])),
  );
  const rows = lines.map((line) => {
    const events = data.movements.filter(
      (m) => m.line_id === line.id && !superseded.has(m.id),
    );
    const sum = (kind: ProductMovement["kind"]) =>
      events.filter((m) => m.kind === kind).reduce((s, m) => s + m.quantity, 0);
    const received = sum("received"),
      damaged = sum("damaged"),
      returned = sum("returned"),
      usable = Math.max(0, received - damaged - returned);
    return {
      line,
      shipped: sum("shipped"),
      received,
      damaged,
      returned,
      usable,
      replacementUsable: 0,
      remaining:
        line.state === "canceled" ? 0 : Math.max(0, line.quantity - usable),
      delay:
        line.state === "canceled" || usable >= line.quantity
          ? "none"
          : !line.promised_on
            ? "date_missing"
            : line.promised_on < asOf
              ? "overdue"
              : "pending",
    };
  });
  // A received remake can satisfy the original damaged opening. Keep each physical
  // movement on its own order; avoid counting the same missing unit twice.
  const descendants = (id: string) =>
    rows.filter((r) => r.line.remake_of === id);
  const credited = new Set<string>();
  function credit(
    row: (typeof rows)[number],
    path = new Set<string>(),
  ): number {
    if (path.has(row.line.id)) return 0;
    if (credited.has(row.line.id))
      return Math.min(row.line.quantity, row.usable);
    const next = new Set(path).add(row.line.id);
    row.replacementUsable = descendants(row.line.id).reduce(
      (sum, child) => sum + credit(child, next),
      0,
    );
    row.usable += row.replacementUsable;
    row.remaining =
      row.line.state === "canceled"
        ? 0
        : Math.max(0, row.line.quantity - row.usable);
    if (row.remaining === 0) row.delay = "none";
    credited.add(row.line.id);
    return Math.min(row.line.quantity, row.usable);
  }
  rows.forEach((row) => credit(row));
  function remainingGroup(
    row: (typeof rows)[number],
    path = new Set<string>(),
  ): number {
    if (path.has(row.line.id)) return row.remaining;
    const next = new Set(path).add(row.line.id);
    return Math.max(
      row.remaining,
      descendants(row.line.id).reduce(
        (sum, r) => sum + remainingGroup(r, next),
        0,
      ),
    );
  }
  const totalRemaining = rows
    .filter((r) => !r.line.remake_of)
    .reduce((sum, r) => sum + remainingGroup(r), 0);
  const missingScope = scope
    ? scope.lines.filter(
        (s) =>
          !lines.some(
            (l) =>
              !l.remake_of &&
              l.source_line_id === s.id &&
              l.source_revision === scope.source_revision &&
              l.quantity === s.quantity,
          ),
      ).length
    : null;
  const openVisits = data.visits.filter(
    (v) => v.quote_id === quoteId && ["planned", "partial"].includes(v.outcome),
  );
  const complete =
    !!scope &&
    scope.lines.length > 0 &&
    missingScope === 0 &&
    rows.every(
      (r) =>
        r.remaining === 0 && !r.line.hold_reason && r.line.state !== "canceled",
    );
  return {
    scope,
    rows,
    missingScope,
    openVisits,
    complete,
    remaining: totalRemaining,
    hasEvidence: !!scope || lines.length > 0,
    partiallyReceived: rows.some((r) => r.usable > 0) && !complete,
    shipped: rows.some((r) => r.shipped > 0),
    held: rows.some((r) => !!r.line.hold_reason),
    delayed: rows.filter((r) => r.delay === "overdue"),
    missingPromises: rows.filter((r) => r.delay === "date_missing"),
  };
}
