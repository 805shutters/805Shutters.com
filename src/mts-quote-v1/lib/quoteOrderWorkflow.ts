import type { WorkflowRun, WorkflowRunStatus } from "@mts-v1/hooks/useWorkflowRuns";
import type { QuoteLineItemWithDesigns, SalesQuote, SalesQuoteWithItems } from "@mts-v1/types/quote";
import { hasValidDimensions } from "@mts-v1/types/quote";

export const QUOTE_NORMAN_ORDER_WORKFLOW_ID = "quote_norman_order_entry";

export interface QuoteOrderAgentRun {
  id: string;
  quoteId: string;
  status: WorkflowRunStatus;
  summary: string | null;
  startedAt: string;
  finishedAt: string | null;
  screenshotPath: string | null;
}

export type QuoteOrderAgentRunsByQuoteId = Record<string, QuoteOrderAgentRun>;

export type QuoteOrderAgentQueueStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface QuoteOrderAgentQueueRow {
  id: string;
  quote_id: string;
  account_id: string | null;
  request_type: "payload_dry_run" | "portal_draft";
  status: QuoteOrderAgentQueueStatus;
  requested_by: string | null;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  workflow_run_id: string | null;
  screenshot_path: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type QuoteOrderAgentQueueByQuoteId = Record<string, QuoteOrderAgentQueueRow>;

export interface RollerShadeOrderReadiness {
  applies: boolean;
  ready: boolean;
  portalFlow: "roller_shades" | null;
  workflowKind: "norman_roller_shade_portal_draft" | null;
  itemCount: number;
  missingFields: string[];
}

export function getQuoteOrderAgentRun(run: WorkflowRun): QuoteOrderAgentRun | null {
  if (run.workflow_id !== QUOTE_NORMAN_ORDER_WORKFLOW_ID) return null;

  const quoteId =
    getStringDetail(run.details, "quote_id") || getStringDetail(run.details, "quoteId");
  if (!quoteId) return null;

  const screenshotPath =
    run.error_screenshot_path ||
    getStringDetail(run.details, "screenshot_path") ||
    getStringDetail(run.details, "screenshot_url") ||
    getStringDetail(run.details, "proof_path") ||
    null;

  return {
    id: run.id,
    quoteId,
    status: run.status,
    summary: run.summary,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    screenshotPath,
  };
}

export function getLatestQuoteOrderAgentRunsByQuoteId(
  runs: WorkflowRun[]
): QuoteOrderAgentRunsByQuoteId {
  return runs.reduce<QuoteOrderAgentRunsByQuoteId>((acc, run) => {
    const agentRun = getQuoteOrderAgentRun(run);
    if (!agentRun) return acc;

    const current = acc[agentRun.quoteId];
    if (
      !current ||
      new Date(agentRun.startedAt).getTime() > new Date(current.startedAt).getTime()
    ) {
      acc[agentRun.quoteId] = agentRun;
    }

    return acc;
  }, {});
}

export function getLatestQuoteOrderAgentQueueByQuoteId(
  rows: QuoteOrderAgentQueueRow[]
): QuoteOrderAgentQueueByQuoteId {
  return rows.reduce<QuoteOrderAgentQueueByQuoteId>((acc, row) => {
    const current = acc[row.quote_id];
    if (
      !current ||
      new Date(row.requested_at).getTime() > new Date(current.requested_at).getTime()
    ) {
      acc[row.quote_id] = row;
    }
    return acc;
  }, {});
}

export function isQuoteOrderAgentQueueOpen(row: QuoteOrderAgentQueueRow | null | undefined) {
  return row?.status === "queued" || row?.status === "processing";
}

export function getRollerShadeOrderReadiness(
  quote: SalesQuoteWithItems
): RollerShadeOrderReadiness {
  const lineItems = quote.line_items || [];
  const rollerItems = lineItems.filter((item) => isRollerShadeLineItem(item));
  const applies = rollerItems.length > 0;
  const missingFields: string[] = [];

  if (!applies) {
    return {
      applies: false,
      ready: false,
      portalFlow: null,
      workflowKind: null,
      itemCount: 0,
      missingFields,
    };
  }

  if (quote.status !== "sold") {
    missingFields.push("Quote must be signed/sold before manufacturer order draft");
  }
  if (!quote.customer_name?.trim()) missingFields.push("Customer name");

  const nonRollerRooms = lineItems
    .filter((item) => !isRollerShadeLineItem(item))
    .map((item) => item.room_name || `Line ${item.sort_order || item.id}`)
    .filter(Boolean);
  if (nonRollerRooms.length) {
    missingFields.push(`Quote contains non-roller line items: ${nonRollerRooms.join(", ")}`);
  }

  for (const item of rollerItems) {
    collectRollerShadeLineMissingFields(item, missingFields);
  }

  return {
    applies: true,
    ready: missingFields.length === 0,
    portalFlow: "roller_shades",
    workflowKind: "norman_roller_shade_portal_draft",
    itemCount: rollerItems.length,
    missingFields,
  };
}

export function buildQuoteOrderAgentQueueMetadata(
  quote: SalesQuote | SalesQuoteWithItems
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    quote_number: quote.quote_number,
    customer_name: quote.customer_name,
    requested_from: "quote_dashboard",
    safety: "final_submit_disabled",
  };

  if ("line_items" in quote) {
    const readiness = getRollerShadeOrderReadiness(quote);
    if (readiness.applies) {
      metadata.portal_flow = readiness.portalFlow;
      metadata.workflow_kind = readiness.workflowKind;
      metadata.roller_ready = readiness.ready;
      metadata.roller_item_count = readiness.itemCount;
      metadata.roller_missing_fields = readiness.missingFields;
    }
  }

  return metadata;
}

export function getQuoteOrderAgentRunLabel(run: QuoteOrderAgentRun | null | undefined): string {
  if (!run) return "No agent capture yet";

  switch (run.status) {
    case "running":
      return "Agent entering order";
    case "ok":
      return run.screenshotPath ? "Agent proof captured" : "Agent payload prepared";
    case "partial":
      return "Agent needs review";
    case "fail":
      return "Agent failed";
    case "skipped":
      return "Agent dry-run prepared";
  }
}

function getStringDetail(details: Record<string, unknown> | null | undefined, key: string): string {
  const value = details?.[key];
  return typeof value === "string" ? value : "";
}

function isRollerShadeLineItem(item: QuoteLineItemWithDesigns): boolean {
  return /roller|solar/i.test(item.product_type || "");
}

function collectRollerShadeLineMissingFields(
  item: QuoteLineItemWithDesigns,
  missingFields: string[]
) {
  const room = item.room_name || `Line ${item.sort_order || item.id}`;
  const design = item.designs?.[0];

  if (!hasValidDimensions(item)) missingFields.push(`${room}: dimensions`);
  if (!item.quantity || item.quantity < 1) missingFields.push(`${room}: quantity`);
  if (!design) {
    missingFields.push(`${room}: design selections`);
    return;
  }

  if (design.supplier !== "Norman") missingFields.push(`${room}: supplier`);
  if (!design.mount_type) missingFields.push(`${room}: mount type`);
  if (!design.shade_type) missingFields.push(`${room}: shade type`);
  if (!design.lift_system) missingFields.push(`${room}: lift system`);
  if (!design.valance) missingFields.push(`${room}: valance`);
  if (!design.fabric) missingFields.push(`${room}: fabric`);
  if (!(design.options_json as Record<string, unknown> | undefined)?.hem_bar) {
    missingFields.push(`${room}: hem bar`);
  }

  if (/motor/i.test(design.lift_system || "")) {
    if (!design.motor_type) missingFields.push(`${room}: motor type`);
  }
}
