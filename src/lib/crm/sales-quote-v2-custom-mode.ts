import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { calculateCustomMode, customModeCustomerRetail, type CustomModeInput } from "@/lib/quote-v2/custom-mode";
import { createHash } from "node:crypto";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const uuid = (value: unknown, label: string) => {
  const text = String(value || "");
  if (!/^[0-9a-f-]{36}$/i.test(text)) throw new CrmAuthError(400, `${label} is invalid.`);
  return text;
};
const finite = (value: unknown, label: string) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new CrmAuthError(400, `${label} must be nonnegative.`);
  return number;
};

export function parseCustomModeBody(value: unknown) {
  const body = record(value);
  const allowed = new Set(["lineItemId","designId","expectedRevision","idempotencyKey","manufacturerCost","freightCost","otherCost","profitMode","profitValue","finalSellPrice","roomName","designName","widthWhole","widthFraction","heightWhole","heightFraction"]);
  const unexpected = Object.keys(body).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new CrmAuthError(400, `Custom Mode rejected fields: ${unexpected.join(", ")}.`);
  const profitMode = body.profitMode === "margin" ? "margin" : body.profitMode === "dollar" ? "dollar" : null;
  if (!profitMode) throw new CrmAuthError(400, "Choose dollar profit or margin.");
  return {
    lineItemId: uuid(body.lineItemId, "lineItemId"),
    designId: uuid(body.designId, "designId"),
    expectedRevision: Math.max(0, Math.floor(finite(body.expectedRevision, "expectedRevision"))),
    idempotencyKey: (() => {
      const value = String(body.idempotencyKey || "").trim();
      if (!value || value.length > 200) {
        throw new CrmAuthError(400, "A non-empty idempotency key of at most 200 characters is required.");
      }
      return value;
    })(),
    financial: {
      manufacturerCost: finite(body.manufacturerCost, "manufacturerCost"),
      freightCost: finite(body.freightCost, "freightCost"),
      otherCost: finite(body.otherCost, "otherCost"),
      profitMode,
      profitValue: finite(body.profitValue, "profitValue"),
      finalSellPrice: body.finalSellPrice == null || body.finalSellPrice === "" ? null : finite(body.finalSellPrice, "finalSellPrice"),
    } satisfies CustomModeInput,
    linePatch: {
      roomName: String(body.roomName || "").trim() || null,
      widthWhole: body.widthWhole == null ? null : Math.floor(finite(body.widthWhole, "widthWhole")),
      widthFraction: String(body.widthFraction || "").trim() || null,
      heightWhole: body.heightWhole == null ? null : Math.floor(finite(body.heightWhole, "heightWhole")),
      heightFraction: String(body.heightFraction || "").trim() || null,
    },
    designPatch: { name: String(body.designName || "").trim() || null },
  };
}

export async function applySalesQuoteV2CustomMode(
  supabase: SupabaseClient,
  quoteId: string,
  actorId: string,
  input: ReturnType<typeof parseCustomModeBody>,
) {
  const { data: design, error } = await supabase
    .from("sales_quote_designs")
    .select("id,current_v2_snapshot_id")
    .eq("id", input.designId)
    .eq("line_item_id", input.lineItemId)
    .maybeSingle();
  if (error || !design?.current_v2_snapshot_id) {
    throw new CrmAuthError(409, "Price the standard V2 design before enabling Custom Mode.");
  }
  const { data: currentSnapshot, error: snapshotError } = await supabase
    .from("sales_quote_v2_price_snapshots")
    .select("*")
    .eq("id", design.current_v2_snapshot_id)
    .maybeSingle();
  if (snapshotError || !currentSnapshot) throw new CrmAuthError(409, "The original V2 snapshot is unavailable.");
  const currentProvenance = record(currentSnapshot.provenance_snapshot);
  const rootSnapshotId = currentSnapshot.catalog_version === "custom-override-v1"
    ? uuid(currentProvenance.originalSnapshotId, "originalSnapshotId")
    : currentSnapshot.id;
  const { data: snapshot, error: rootSnapshotError } = rootSnapshotId === currentSnapshot.id
    ? { data: currentSnapshot, error: null }
    : await supabase
        .from("sales_quote_v2_price_snapshots")
        .select("*")
        .eq("id", rootSnapshotId)
        .maybeSingle();
  if (rootSnapshotError || !snapshot || snapshot.catalog_version === "custom-override-v1") {
    throw new CrmAuthError(409, "The immutable standard V2 snapshot is unavailable.");
  }
  const financials = calculateCustomMode(input.financial);
  const originalSnapshot = record(snapshot.retail_snapshot);
  const originalRetail = record(originalSnapshot.retail);
  const customFingerprint = createHash("sha256")
    .update(`${input.designId}:${input.expectedRevision + 1}:${input.idempotencyKey}`)
    .digest("hex");
  const retail = {
    ...originalSnapshot,
    priceStatus: "authoritative",
    selectionFingerprint: customFingerprint,
    catalogVersion: "custom-override-v1",
    retail: customModeCustomerRetail(originalRetail, financials.sellPrice),
  };
  const provenance = {
    mode: "custom_override",
    internalOnly: true,
    originalSnapshotId: snapshot.id,
    originalCatalogVersion: snapshot.catalog_version,
    originalSelectionFingerprint: snapshot.selection_fingerprint,
    originalProvenance: snapshot.provenance_snapshot,
    customFingerprint,
  };
  const internal = {
    mode: "custom_override",
    manufacturerCost: input.financial.manufacturerCost,
    freightCost: input.financial.freightCost,
    otherCost: input.financial.otherCost,
    ...financials,
  };
  const { data, error: rpcError } = await supabase.rpc("apply_quote_v2_custom_override", {
    p_quote_id: quoteId, p_line_item_id: input.lineItemId, p_design_id: input.designId,
    p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey,
    p_actor_id: actorId, p_line_patch: input.linePatch, p_design_patch: input.designPatch,
    p_retail_snapshot: retail, p_internal_snapshot: internal,
    p_provenance_snapshot: provenance, p_override_input: input.financial,
    p_override_financials: financials,
  });
  if (rpcError) throw new CrmAuthError(409, rpcError.message);
  return data;
}
