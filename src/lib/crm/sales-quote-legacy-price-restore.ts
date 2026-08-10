import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { loadPublicQuoteById } from "@/lib/crm/public-quote";
import { resyncSalesQuoteCustomerMirror } from "@/lib/crm/sales-quote-send";

const CONFIRMATION = "RESTORE_HISTORICAL_LEGACY_PRICE_LOCK";
const AUTHORIZED_REPAIR = {
  targetSalesQuoteId: "c26ef5f2-9da0-4f79-9e93-0933b84b4303",
  sourceSalesQuoteId: "df588b69-2c95-41c3-b99b-94d1db73a78c",
  quoteNumber: "805-0161-FUTURE",
  total: 3499.1,
  color: "101_White",
} as const;
const PRICE_OPTION_KEYS = [
  "base_price",
  "surcharge_total",
  "pricing_method",
  "discount_percent",
  "discount_source_price",
  "discount_amount",
] as const;

type Row = Record<string, any>;

export type LegacyPriceRestoreInput = {
  mode: "dryRun" | "apply";
  confirmation: string;
  sourceSalesQuoteId: string;
  expectedQuoteNumber: string;
  expectedTotal: number;
  expectedColor: string;
};

export type LegacyPriceRestorePlan = {
  targetQuoteId: string;
  sourceQuoteId: string;
  expectedTotal: number;
  matched: Array<{
    targetLine: Row;
    targetDesign: Row;
    sourceLine: Row;
    sourceDesign: Row;
    unitPrice: number;
    lineTotal: number;
  }>;
  missing: {
    sourceLine: Row;
    sourceDesign: Row;
    templateDesign: Row;
    unitPrice: number;
    lineTotal: number;
  };
};

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function cents(value: unknown): number {
  return Math.round(money(value) * 100);
}

function quantity(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function lineKey(line: Row): string {
  return [
    text(line.room_name).toLowerCase(),
    Number(line.width_whole) || 0,
    text(line.width_fraction) || "0",
    Number(line.height_whole) || 0,
    text(line.height_fraction) || "0",
    quantity(line.quantity),
    Number(line.sort_order) || 0,
    text(line.product_type).toLowerCase(),
  ].join("|");
}

function lineDesign(line: Row, designsByLine: Map<string, Row[]>): Row {
  const designs = designsByLine.get(String(line.id)) || [];
  const selected = designs.find((design) => design.id === line.selected_design_id);
  if (selected) return selected;
  if (designs.length === 1) return designs[0];
  throw new CrmAuthError(409, `Line ${line.room_name || line.id} does not have one unambiguous price.`);
}

function lineTotal(line: Row, design: Row): number {
  return money(money(design.unit_price) * quantity(line.quantity));
}

export function parseLegacyPriceRestoreInput(value: unknown): LegacyPriceRestoreInput {
  const body = record(value);
  const mode = body.mode === "dryRun" || body.mode === "apply" ? body.mode : null;
  if (!mode) throw new CrmAuthError(400, "mode must be dryRun or apply.");
  const sourceSalesQuoteId = text(body.sourceSalesQuoteId);
  const expectedQuoteNumber = text(body.expectedQuoteNumber);
  const expectedColor = text(body.expectedColor);
  const expectedTotal = money(body.expectedTotal);
  if (!sourceSalesQuoteId) throw new CrmAuthError(400, "sourceSalesQuoteId is required.");
  if (!expectedQuoteNumber) throw new CrmAuthError(400, "expectedQuoteNumber is required.");
  if (!expectedColor) throw new CrmAuthError(400, "expectedColor is required.");
  if (expectedTotal <= 0) throw new CrmAuthError(400, "expectedTotal must be positive.");
  const confirmation = text(body.confirmation);
  if (mode === "apply" && confirmation !== CONFIRMATION) {
    throw new CrmAuthError(400, `Apply requires confirmation ${CONFIRMATION}.`);
  }
  return { mode, confirmation, sourceSalesQuoteId, expectedQuoteNumber, expectedTotal, expectedColor };
}

export function planHistoricalLegacyPriceRestore(args: {
  targetQuote: Row;
  sourceQuote: Row;
  targetLines: Row[];
  sourceLines: Row[];
  targetDesigns: Row[];
  sourceDesigns: Row[];
  expectedTotal: number;
}): LegacyPriceRestorePlan {
  const { targetQuote, sourceQuote, targetLines, sourceLines, targetDesigns, sourceDesigns } = args;
  const targetDesignsByLine = new Map<string, Row[]>();
  const sourceDesignsByLine = new Map<string, Row[]>();
  for (const design of targetDesigns) {
    targetDesignsByLine.set(String(design.line_item_id), [...(targetDesignsByLine.get(String(design.line_item_id)) || []), design]);
  }
  for (const design of sourceDesigns) {
    sourceDesignsByLine.set(String(design.line_item_id), [...(sourceDesignsByLine.get(String(design.line_item_id)) || []), design]);
  }

  const sourceByKey = new Map(sourceLines.map((line) => [lineKey(line), line]));
  if (sourceByKey.size !== sourceLines.length) {
    throw new CrmAuthError(409, "The legacy source contains duplicate line identities.");
  }

  const matched = targetLines.map((targetLine) => {
    const sourceLine = sourceByKey.get(lineKey(targetLine));
    if (!sourceLine) throw new CrmAuthError(409, `No exact legacy source line matches ${targetLine.room_name || targetLine.id}.`);
    const targetDesign = lineDesign(targetLine, targetDesignsByLine);
    const sourceDesign = lineDesign(sourceLine, sourceDesignsByLine);
    const unitPrice = money(sourceDesign.unit_price);
    if (unitPrice <= 0) throw new CrmAuthError(409, "The legacy source contains an unpriced matched line.");
    return { targetLine, targetDesign, sourceLine, sourceDesign, unitPrice, lineTotal: lineTotal(sourceLine, sourceDesign) };
  });

  const matchedSourceIds = new Set(matched.map((item) => item.sourceLine.id));
  const remainingCents = cents(args.expectedTotal) - matched.reduce((sum, item) => sum + cents(item.lineTotal), 0);
  const candidates = sourceLines
    .filter((line) => !matchedSourceIds.has(line.id))
    .map((sourceLine) => {
      const sourceDesign = lineDesign(sourceLine, sourceDesignsByLine);
      return { sourceLine, sourceDesign, lineTotal: lineTotal(sourceLine, sourceDesign) };
    })
    .filter((item) => cents(item.lineTotal) === remainingCents);
  if (remainingCents <= 0 || candidates.length !== 1) {
    throw new CrmAuthError(409, "The missing historical line cannot be identified uniquely from the expected total.");
  }
  const candidate = candidates[0];
  const template = matched.find((item) =>
    Number(item.targetLine.width_whole) === Number(candidate.sourceLine.width_whole) &&
    text(item.targetLine.width_fraction) === text(candidate.sourceLine.width_fraction) &&
    Number(item.targetLine.height_whole) === Number(candidate.sourceLine.height_whole) &&
    text(item.targetLine.height_fraction) === text(candidate.sourceLine.height_fraction) &&
    text(item.targetLine.product_type) === text(candidate.sourceLine.product_type)
  );
  if (!template) throw new CrmAuthError(409, "No target design can safely template the missing historical line.");

  return {
    targetQuoteId: String(targetQuote.id),
    sourceQuoteId: String(sourceQuote.id),
    expectedTotal: money(args.expectedTotal),
    matched,
    missing: {
      ...candidate,
      templateDesign: template.targetDesign,
      unitPrice: money(candidate.sourceDesign.unit_price),
    },
  };
}

function restoredOptions(target: Row, source: Row, expectedColor: string): Row {
  const options: Row = { ...record(target.options_json), color: expectedColor };
  const sourceOptions = record(source.options_json);
  for (const key of PRICE_OPTION_KEYS) {
    if (sourceOptions[key] !== undefined) options[key] = sourceOptions[key];
  }
  delete options.authoritative_price_status;
  delete options.priced_selection_fingerprint;
  options.quote_v2_backend = false;
  return options;
}

function withoutGeneratedFields(row: Row): Row {
  const next = { ...row };
  for (const key of ["id", "line_item_id", "quote_id", "created_at", "current_v2_snapshot_id"]) delete next[key];
  return next;
}

async function loadStructure(supabase: SupabaseClient, quoteId: string) {
  const { data: lines, error: lineError } = await supabase
    .from("sales_quote_line_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sort_order", { ascending: true });
  if (lineError) throw new CrmAuthError(502, "Quote lines could not be loaded.");
  const lineIds = (lines || []).map((line) => line.id);
  const { data: designs, error: designError } = lineIds.length
    ? await supabase.from("sales_quote_designs").select("*").in("line_item_id", lineIds)
    : { data: [], error: null };
  if (designError) throw new CrmAuthError(502, "Quote designs could not be loaded.");
  return { lines: (lines || []) as Row[], designs: (designs || []) as Row[] };
}

export async function restoreHistoricalLegacyPriceLock(
  supabase: SupabaseClient,
  targetSalesQuoteId: string,
  rawInput: unknown,
  actor: { email: string; userId?: string },
) {
  const input = parseLegacyPriceRestoreInput(rawInput);
  if (
    targetSalesQuoteId !== AUTHORIZED_REPAIR.targetSalesQuoteId ||
    input.sourceSalesQuoteId !== AUTHORIZED_REPAIR.sourceSalesQuoteId ||
    input.expectedQuoteNumber !== AUTHORIZED_REPAIR.quoteNumber ||
    cents(input.expectedTotal) !== cents(AUTHORIZED_REPAIR.total) ||
    input.expectedColor !== AUTHORIZED_REPAIR.color
  ) {
    throw new CrmAuthError(403, "This endpoint is restricted to the authorized historical quote repair.");
  }
  const [{ data: targetQuote, error: targetError }, { data: sourceQuote, error: sourceError }] = await Promise.all([
    supabase.from("sales_quotes").select("*").eq("id", targetSalesQuoteId).maybeSingle(),
    supabase.from("sales_quotes").select("*").eq("id", input.sourceSalesQuoteId).maybeSingle(),
  ]);
  if (targetError || !targetQuote) throw new CrmAuthError(404, "The target quote was not found.");
  if (sourceError || !sourceQuote) throw new CrmAuthError(404, "The legacy source quote was not found.");
  if (targetQuote.quote_number !== input.expectedQuoteNumber) throw new CrmAuthError(409, "The target quote number changed.");
  if (!["draft", "sent"].includes(String(targetQuote.status))) throw new CrmAuthError(409, "Only an unsold draft or sent quote can be restored.");
  if (targetQuote.customer_name !== sourceQuote.customer_name || targetQuote.account_id !== sourceQuote.account_id) {
    throw new CrmAuthError(409, "The target and legacy source do not belong to the same customer account.");
  }
  const alreadyRestored = targetQuote.quote_v2_backend === false && targetQuote.quote_v2_status === "legacy";
  if (!alreadyRestored && (targetQuote.quote_v2_backend !== true || targetQuote.quote_v2_status !== "blocked" || cents(targetQuote.total_amount) !== 0)) {
    throw new CrmAuthError(409, "The target is not the expected zero-dollar blocked V4 quote.");
  }
  if (sourceQuote.quote_v2_backend !== false || sourceQuote.quote_v2_status !== "legacy") {
    throw new CrmAuthError(409, "The source quote is not an intact legacy price lock.");
  }

  const [targetStructure, sourceStructure] = await Promise.all([
    loadStructure(supabase, targetSalesQuoteId),
    loadStructure(supabase, input.sourceSalesQuoteId),
  ]);
  let plan: LegacyPriceRestorePlan | null = null;
  if (!alreadyRestored) {
    plan = planHistoricalLegacyPriceRestore({
      targetQuote,
      sourceQuote,
      targetLines: targetStructure.lines,
      sourceLines: sourceStructure.lines,
      targetDesigns: targetStructure.designs,
      sourceDesigns: sourceStructure.designs,
      expectedTotal: input.expectedTotal,
    });
  }

  const summary = {
    mode: input.mode,
    targetSalesQuoteId,
    sourceSalesQuoteId: input.sourceSalesQuoteId,
    quoteNumber: input.expectedQuoteNumber,
    total: input.expectedTotal,
    existingLineCount: targetStructure.lines.length,
    restoredLineCount: alreadyRestored ? targetStructure.lines.length : targetStructure.lines.length + 1,
    missingRoom: plan?.missing.sourceLine.room_name || null,
    missingLineTotal: plan?.missing.lineTotal || 0,
    alreadyRestored,
  };
  if (input.mode === "dryRun") return summary;

  if (!alreadyRestored && plan) {
    for (const item of plan.matched) {
      const { error } = await supabase
        .from("sales_quote_designs")
        .update({
          unit_price: item.unitPrice,
          options_json: restoredOptions(item.targetDesign, item.sourceDesign, input.expectedColor),
          quote_v2_selection: {},
          quote_v2_price_status: "legacy",
          quote_v2_selection_fingerprint: null,
          quote_v2_priced_catalog_version: null,
          quote_v2_priced_at: null,
          current_v2_snapshot_id: null,
        })
        .eq("id", item.targetDesign.id)
        .eq("line_item_id", item.targetLine.id);
      if (error) throw new CrmAuthError(502, "A historical line price could not be restored.");
    }

    const missingLineId = randomUUID();
    const missingDesignId = randomUUID();
    const missingLine = {
      ...withoutGeneratedFields(plan.missing.sourceLine),
      id: missingLineId,
      quote_id: targetSalesQuoteId,
      selected_design_id: null,
    };
    const missingDesign = {
      ...withoutGeneratedFields(plan.missing.templateDesign),
      id: missingDesignId,
      line_item_id: missingLineId,
      unit_price: plan.missing.unitPrice,
      options_json: restoredOptions(plan.missing.templateDesign, plan.missing.sourceDesign, input.expectedColor),
      quote_v2_selection: {},
      quote_v2_price_status: "legacy",
      quote_v2_selection_fingerprint: null,
      quote_v2_priced_catalog_version: null,
      quote_v2_priced_at: null,
    };

    const cleanupMissing = async () => {
      await supabase
        .from("sales_quote_line_items")
        .update({ selected_design_id: null })
        .eq("id", missingLineId)
        .eq("quote_id", targetSalesQuoteId);
      await supabase.from("sales_quote_designs").delete().eq("id", missingDesignId).eq("line_item_id", missingLineId);
      await supabase.from("sales_quote_line_items").delete().eq("id", missingLineId).eq("quote_id", targetSalesQuoteId);
    };

    const { error: lineInsertError } = await supabase.from("sales_quote_line_items").insert(missingLine);
    if (lineInsertError) throw new CrmAuthError(502, "The missing historical line could not be restored.");
    const { error: designInsertError } = await supabase.from("sales_quote_designs").insert(missingDesign);
    if (designInsertError) {
      await cleanupMissing();
      throw new CrmAuthError(502, "The missing historical design could not be restored.");
    }
    const { error: selectionError } = await supabase
      .from("sales_quote_line_items")
      .update({ selected_design_id: missingDesignId })
      .eq("id", missingLineId)
      .eq("quote_id", targetSalesQuoteId);
    if (selectionError) {
      await cleanupMissing();
      throw new CrmAuthError(502, "The restored historical line could not be selected.");
    }

    const { data: updatedQuote, error: quoteError } = await supabase
      .from("sales_quotes")
      .update({
        total_amount: input.expectedTotal,
        quote_v2_backend: false,
        quote_v2_status: "legacy",
        quote_v2_catalog_version: null,
        quote_v2_revision: 0,
        quote_v2_last_priced_at: null,
      })
      .eq("id", targetSalesQuoteId)
      .eq("quote_v2_backend", true)
      .eq("quote_v2_status", "blocked")
      .eq("quote_v2_revision", targetQuote.quote_v2_revision)
      .select("id")
      .maybeSingle();
    if (quoteError || !updatedQuote) {
      await cleanupMissing();
      throw new CrmAuthError(409, "The target quote changed before the legacy lock was restored.");
    }
  }

  const crmQuoteId = await resyncSalesQuoteCustomerMirror(supabase, targetSalesQuoteId);
  const publicQuote = await loadPublicQuoteById(supabase, crmQuoteId);
  const expectedPublicLineCount = alreadyRestored
    ? targetStructure.lines.reduce((sum, line) => sum + quantity(line.quantity), 0)
    : (plan?.matched.reduce((sum, item) => sum + quantity(item.targetLine.quantity), 0) || 0) + quantity(plan?.missing.sourceLine.quantity);
  if (!publicQuote || cents(publicQuote.total) !== cents(input.expectedTotal) || !publicQuote.allPriced || publicQuote.lines.length !== expectedPublicLineCount) {
    throw new CrmAuthError(502, "The restored quote did not pass customer-facing verification.");
  }
  const restoredStructure = await loadStructure(supabase, targetSalesQuoteId);
  if (
    restoredStructure.designs.length !== restoredStructure.lines.length ||
    restoredStructure.designs.some((design) => text(record(design.options_json).color) !== input.expectedColor)
  ) {
    throw new CrmAuthError(502, "The restored quote color did not match the requested value.");
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: crmQuoteId,
    action: "historical_legacy_price_lock.restore",
    metadata: {
      sourceSalesQuoteId: input.sourceSalesQuoteId,
      targetSalesQuoteId,
      quoteNumber: input.expectedQuoteNumber,
      total: input.expectedTotal,
      lineCount: publicQuote.lines.length,
      color: input.expectedColor,
    },
  });

  return {
    ...summary,
    mode: "apply" as const,
    crmQuoteId,
    shareTokenPreserved: Boolean(targetQuote.share_token),
    customerFacing: {
      total: publicQuote.total,
      lineCount: publicQuote.lines.length,
      allPriced: publicQuote.allPriced,
    },
  };
}
