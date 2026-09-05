import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  isPolarQuoteOnlyProductId,
  polarQuoteOnlyOptions,
} from "@/lib/quote/quote-only-policy";

type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FRACTIONS = new Set([
  "0",
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "9/16",
  "5/8",
  "11/16",
  "3/4",
  "13/16",
  "7/8",
  "15/16",
]);

const PROTECTED_NORMALIZED_KEYS = new Set([
  "price",
  "amount",
  "subtotal",
  "total",
  "unitprice",
  "retail",
  "retailtotal",
  "totalamount",
  "productcost",
  "manufacturercost",
  "profitamount",
  "baseprice",
  "surchargetotal",
  "pricingmethod",
  "pricinggridkey",
  "pricinggridprice",
  "pricinggridwidth",
  "pricinggridheight",
  "pricingbuiltinadjustment",
  "discountsourceprice",
  "discountamount",
  "manualpriceoverride",
  "processingfee",
  "processingfeeallocated",
  "freight",
  "freightallocated",
  "oversizecharge",
  "oversizeallocated",
  "authoritativeprice",
  "authoritativepricebreakdown",
  "authoritativecostbreakdown",
  "authoritativeoncetotal",
  "authoritativev2snapshot",
  "authoritativepricestatus",
  "pricedselectionfingerprint",
  "pricedcatalogversion",
  "quotev2backend",
  "quotev2catalogversion",
  "quotev2catalogasof",
  "quotev2selection",
  "quotev2pricestatus",
  "quotev2selectionfingerprint",
  "quotev2pricedcatalogversion",
  "quotev2pricedat",
  "currentv2snapshotid",
  "dealerportalsnapshot",
  "provenance",
  "provenancesnapshot",
  "validationsnapshot",
  "sourceid",
  "sourcehash",
  "sourcefilename",
  "sourcerevision",
  "sourcepage",
  "sourcesheet",
  "effectivedate",
  "guideversion",
  "catalogversion",
  "catalogasof",
]);

const QUOTE_PATCH_FIELDS = [
  "customerName",
  "customerPhone",
  "customerEmail",
  "customerAddress",
  "appointmentDate",
  "installerNotes",
  "quoteGroupId",
  "quoteLetter",
] as const;

const LINE_PATCH_FIELDS = [
  "roomName",
  "productType",
  "widthWhole",
  "widthFraction",
  "heightWhole",
  "heightFraction",
  "quantity",
  "sortOrder",
] as const;

const DESIGN_PATCH_STRING_FIELDS = [
  "productType",
  "supplier",
  "material",
  "louverSize",
  "tiltType",
  "hingeColor",
  "panelConfig",
  "mountType",
  "shadeType",
  "liftSystem",
  "valance",
  "fabric",
  "motorType",
  "remoteType",
] as const;

const DESIGN_PATCH_BOOLEAN_FIELDS = [
  "hardSurfaceInstall",
  "ladderOver15ft",
  "requiresTakedown",
] as const;

export type QuoteV2CreateDraftBody = Readonly<{
  idempotencyKey: string;
  createdJobId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  appointmentDate?: string | null;
  installerNotes?: string | null;
  quoteGroupId?: string | null;
  quoteLetter?: string;
}>;

export type QuoteV2StructureOperation =
  | Readonly<{ type: "quote.update"; patch: JsonObject }>
  | Readonly<{
      type: "line.create";
      lineItemId?: string;
      patch: JsonObject;
    }>
  | Readonly<{
      type: "line.update";
      lineItemId: string;
      patch: JsonObject;
    }>
  | Readonly<{ type: "line.delete"; lineItemId: string }>
  | Readonly<{ type: "lines.clear" }>
  | Readonly<{
      type: "line.copy";
      sourceLineItemId: string;
      targetLineItemId?: string;
      sortOrder?: number;
    }>
  | Readonly<{
      type: "design.upsert";
      lineItemId: string;
      designId?: string;
      variant: string;
      selectDesign: boolean;
      patch: JsonObject;
    }>
  | Readonly<{
      type: "design.select" | "design.delete";
      lineItemId: string;
      designId: string;
    }>
  | Readonly<{
      type: "design.copySet";
      sourceLineItemId: string;
      targetLineItemId: string;
    }>;

export type QuoteV2CreateDraftResponse = Readonly<{
  backend: "authoritative_v2";
  quoteId: string;
  quoteNumber: string;
  revision: number;
  status: "draft";
  quoteV2Status: "draft";
  lineCount: 0;
}>;

export type QuoteV2StructureResponse = Readonly<{
  backend: "authoritative_v2";
  quoteId: string;
  revision: number;
  status: "draft";
  quoteV2Status: "draft" | "stale";
  lineCount: number;
  selectedDesigns: Readonly<Record<string, string | null>>;
  operations: readonly JsonObject[];
}>;

function plainObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CrmAuthError(400, `${label} must be a JSON object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CrmAuthError(400, `${label} must be a plain JSON object.`);
  }
  return value as JsonObject;
}

function optionalPlainObject(value: unknown, label: string): JsonObject {
  return value === undefined ? {} : plainObject(value, label);
}

function assertAllowedKeys(
  value: JsonObject,
  allowed: readonly string[],
  label: string,
) {
  const accepted = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !accepted.has(key));
  if (unexpected.length) {
    throw new CrmAuthError(
      400,
      `${label} rejected field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`,
    );
  }
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new CrmAuthError(400, `${label} must be a valid UUID.`);
  }
  return value.trim().toLowerCase();
}

function optionalUuid(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : uuid(value, label);
}

function nullableUuid(value: unknown, label: string): string | null {
  return value === null || value === "" ? null : uuid(value, label);
}

function idempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_PATTERN.test(value.trim())) {
    throw new CrmAuthError(
      400,
      "idempotencyKey must be 8-200 safe identifier characters.",
    );
  }
  return value.trim();
}

function safeInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new CrmAuthError(
      400,
      `${label} must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return value;
}

function requiredText(
  value: unknown,
  label: string,
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new CrmAuthError(400, `${label} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new CrmAuthError(
      400,
      `${label} must contain 1-${maximum} characters.`,
    );
  }
  return normalized;
}

function nullableText(
  value: unknown,
  label: string,
  maximum: number,
): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > maximum) {
    throw new CrmAuthError(
      400,
      `${label} must be null or at most ${maximum} characters of text.`,
    );
  }
  return value.trim() || null;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new CrmAuthError(400, `${label} must be true or false.`);
  }
  return value;
}

function normalizeProtectedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isProtectedQuoteV2StructureKey(key: string): boolean {
  const normalized = normalizeProtectedKey(key);
  return (
    /(dealer|wholesale|internal|landed|margin|markup|multiplier|cost)/.test(
      normalized,
    ) ||
    PROTECTED_NORMALIZED_KEYS.has(normalized) ||
    /^(authoritative|priced)/.test(normalized) ||
    /(snapshot|fingerprint)$/.test(normalized) ||
    /retail/.test(normalized) ||
    /(price|amount|subtotal)(cents|dollars|persqft)?$/.test(normalized) ||
    /^total(cents|dollars)?$/.test(normalized)
  );
}

function assertCustomerSafeJson(
  value: unknown,
  label: string,
  state: { nodes: number },
  depth = 0,
) {
  if (depth > 20) {
    throw new CrmAuthError(400, `${label} is nested too deeply.`);
  }
  state.nodes += 1;
  if (state.nodes > 20_000) {
    throw new CrmAuthError(400, `${label} contains too many values.`);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CrmAuthError(400, `${label} contains a non-finite number.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) =>
      assertCustomerSafeJson(entry, label, state, depth + 1),
    );
    return;
  }
  const object = plainObject(value, label);
  for (const [key, entry] of Object.entries(object)) {
    if (isProtectedQuoteV2StructureKey(key)) {
      throw new CrmAuthError(
        400,
        `${label} cannot contain protected pricing or cost field ${key}.`,
      );
    }
    assertCustomerSafeJson(entry, label, state, depth + 1);
  }
}

function quotePatch(
  raw: unknown,
  label: string,
  requireCustomerName = false,
): JsonObject {
  const patch = plainObject(raw, label);
  assertAllowedKeys(patch, QUOTE_PATCH_FIELDS, label);
  if (!Object.keys(patch).length) {
    throw new CrmAuthError(400, `${label} cannot be empty.`);
  }
  const normalized: JsonObject = {};
  if (requireCustomerName || "customerName" in patch) {
    normalized.customerName = requiredText(
      patch.customerName,
      `${label}.customerName`,
      200,
    );
  }
  const contactFields = [
    ["customerPhone", 100],
    ["customerEmail", 320],
    ["customerAddress", 1000],
    ["installerNotes", 20_000],
  ] as const;
  for (const [field, maximum] of contactFields) {
    if (field in patch) {
      normalized[field] = nullableText(
        patch[field],
        `${label}.${field}`,
        maximum,
      );
    }
  }
  if ("appointmentDate" in patch) {
    if (
      patch.appointmentDate !== null &&
      (typeof patch.appointmentDate !== "string" ||
        !ISO_DATE_PATTERN.test(patch.appointmentDate) ||
        Number.isNaN(Date.parse(`${patch.appointmentDate}T00:00:00Z`)))
    ) {
      throw new CrmAuthError(
        400,
        `${label}.appointmentDate must be null or YYYY-MM-DD.`,
      );
    }
    normalized.appointmentDate = patch.appointmentDate;
  }
  if ("quoteGroupId" in patch) {
    normalized.quoteGroupId = nullableUuid(
      patch.quoteGroupId,
      `${label}.quoteGroupId`,
    );
  }
  if ("quoteLetter" in patch) {
    const letter = requiredText(
      patch.quoteLetter,
      `${label}.quoteLetter`,
      1,
    ).toUpperCase();
    if (!/^[A-Z]$/.test(letter)) {
      throw new CrmAuthError(
        400,
        `${label}.quoteLetter must be one letter from A through Z.`,
      );
    }
    normalized.quoteLetter = letter;
  }
  return normalized;
}

function linePatch(
  raw: unknown,
  label: string,
  required: boolean,
): JsonObject {
  const patch = plainObject(raw, label);
  assertAllowedKeys(patch, LINE_PATCH_FIELDS, label);
  if (!Object.keys(patch).length) {
    throw new CrmAuthError(400, `${label} cannot be empty.`);
  }
  const normalized: JsonObject = {};
  if (required || "roomName" in patch) {
    normalized.roomName = requiredText(
      patch.roomName,
      `${label}.roomName`,
      200,
    );
  }
  if (required || "productType" in patch) {
    normalized.productType = requiredText(
      patch.productType,
      `${label}.productType`,
      200,
    );
  }
  for (const [field, minimum, maximum, fallback] of [
    ["widthWhole", 0, 1000, 0],
    ["heightWhole", 0, 1000, 0],
    ["quantity", 1, 1000, 1],
    ["sortOrder", 0, 10_000, 0],
  ] as const) {
    if (field in patch) {
      normalized[field] = safeInteger(
        patch[field],
        `${label}.${field}`,
        minimum,
        maximum,
      );
    } else if (required) {
      normalized[field] = fallback;
    }
  }
  for (const field of ["widthFraction", "heightFraction"] as const) {
    if (field in patch) {
      if (typeof patch[field] !== "string" || !FRACTIONS.has(patch[field])) {
        throw new CrmAuthError(
          400,
          `${label}.${field} is not a supported sixteenth-inch fraction.`,
        );
      }
      normalized[field] = patch[field];
    } else if (required) {
      normalized[field] = "0";
    }
  }
  return normalized;
}

function designPatch(raw: unknown, label: string): JsonObject {
  const patch = optionalPlainObject(raw, label);
  assertAllowedKeys(
    patch,
    [
      ...DESIGN_PATCH_STRING_FIELDS,
      ...DESIGN_PATCH_BOOLEAN_FIELDS,
      "notes",
      "optionsJson",
    ],
    label,
  );
  const normalized: JsonObject = {};
  for (const field of DESIGN_PATCH_STRING_FIELDS) {
    if (field in patch) {
      normalized[field] = nullableText(
        patch[field],
        `${label}.${field}`,
        1000,
      );
    }
  }
  for (const field of DESIGN_PATCH_BOOLEAN_FIELDS) {
    if (field in patch) {
      normalized[field] = boolean(patch[field], `${label}.${field}`);
    }
  }
  if ("notes" in patch) {
    normalized.notes = nullableText(patch.notes, `${label}.notes`, 20_000);
  }
  if ("optionsJson" in patch) {
    const options = plainObject(patch.optionsJson, `${label}.optionsJson`);
    assertCustomerSafeJson(options, `${label}.optionsJson`, { nodes: 0 });
    if (Buffer.byteLength(JSON.stringify(options), "utf8") > 200_000) {
      throw new CrmAuthError(
        400,
        `${label}.optionsJson exceeds 200,000 bytes.`,
      );
    }
    normalized.optionsJson = options;
  }
  const options = (normalized.optionsJson as JsonObject | undefined) ?? {};
  const productId =
    typeof options.catalog_product_id === "string"
      ? options.catalog_product_id
      : typeof options.product_id === "string"
        ? options.product_id
        : "";
  if (isPolarQuoteOnlyProductId(productId)) {
    normalized.supplier = "Polar";
    normalized.optionsJson = {
      ...options,
      ...polarQuoteOnlyOptions(productId || "polar_unspecified"),
    };
  }
  return normalized;
}

function parseOperation(value: unknown, index: number): QuoteV2StructureOperation {
  const operation = plainObject(value, `operations[${index}]`);
  const type = operation.type;
  if (typeof type !== "string") {
    throw new CrmAuthError(400, `operations[${index}].type is required.`);
  }
  const label = `operations[${index}]`;

  switch (type) {
    case "quote.update":
      assertAllowedKeys(operation, ["type", "patch"], label);
      return { type, patch: quotePatch(operation.patch, `${label}.patch`) };
    case "line.create": {
      assertAllowedKeys(operation, ["type", "lineItemId", "patch"], label);
      const lineItemId = optionalUuid(
        operation.lineItemId,
        `${label}.lineItemId`,
      );
      return {
        type,
        ...(lineItemId ? { lineItemId } : {}),
        patch: linePatch(operation.patch, `${label}.patch`, true),
      };
    }
    case "line.update":
      assertAllowedKeys(operation, ["type", "lineItemId", "patch"], label);
      return {
        type,
        lineItemId: uuid(operation.lineItemId, `${label}.lineItemId`),
        patch: linePatch(operation.patch, `${label}.patch`, false),
      };
    case "line.delete":
      assertAllowedKeys(operation, ["type", "lineItemId"], label);
      return {
        type,
        lineItemId: uuid(operation.lineItemId, `${label}.lineItemId`),
      };
    case "lines.clear":
      assertAllowedKeys(operation, ["type"], label);
      return { type };
    case "line.copy": {
      assertAllowedKeys(
        operation,
        ["type", "sourceLineItemId", "targetLineItemId", "sortOrder"],
        label,
      );
      const targetLineItemId = optionalUuid(
        operation.targetLineItemId,
        `${label}.targetLineItemId`,
      );
      const sortOrder =
        operation.sortOrder === undefined
          ? undefined
          : safeInteger(operation.sortOrder, `${label}.sortOrder`, 0, 10_000);
      const sourceLineItemId = uuid(
        operation.sourceLineItemId,
        `${label}.sourceLineItemId`,
      );
      if (targetLineItemId === sourceLineItemId) {
        throw new CrmAuthError(
          400,
          `${label}.targetLineItemId must differ from sourceLineItemId.`,
        );
      }
      return {
        type,
        sourceLineItemId,
        ...(targetLineItemId ? { targetLineItemId } : {}),
        ...(sortOrder === undefined ? {} : { sortOrder }),
      };
    }
    case "design.upsert": {
      assertAllowedKeys(
        operation,
        [
          "type",
          "lineItemId",
          "designId",
          "variant",
          "selectDesign",
          "patch",
        ],
        label,
      );
      const designId = optionalUuid(operation.designId, `${label}.designId`);
      return {
        type,
        lineItemId: uuid(operation.lineItemId, `${label}.lineItemId`),
        ...(designId ? { designId } : {}),
        variant: requiredText(operation.variant, `${label}.variant`, 80),
        selectDesign: boolean(
          operation.selectDesign,
          `${label}.selectDesign`,
        ),
        patch: designPatch(operation.patch, `${label}.patch`),
      };
    }
    case "design.select":
    case "design.delete":
      assertAllowedKeys(
        operation,
        ["type", "lineItemId", "designId"],
        label,
      );
      return {
        type,
        lineItemId: uuid(operation.lineItemId, `${label}.lineItemId`),
        designId: uuid(operation.designId, `${label}.designId`),
      };
    case "design.copySet":
      assertAllowedKeys(
        operation,
        ["type", "sourceLineItemId", "targetLineItemId"],
        label,
      );
      {
        const sourceLineItemId = uuid(
          operation.sourceLineItemId,
          `${label}.sourceLineItemId`,
        );
        const targetLineItemId = uuid(
          operation.targetLineItemId,
          `${label}.targetLineItemId`,
        );
        if (sourceLineItemId === targetLineItemId) {
          throw new CrmAuthError(
            400,
            `${label}.targetLineItemId must differ from sourceLineItemId.`,
          );
        }
        return {
          type,
          sourceLineItemId,
          targetLineItemId,
        };
      }
    default:
      throw new CrmAuthError(
        400,
        `Unsupported Quote V2 structural operation: ${type}.`,
      );
  }
}

export function parseCreateSalesQuoteV2DraftBody(
  value: unknown,
): Readonly<{ idempotencyKey: string; createdJobId?: string | null; quotePatch: JsonObject }> {
  const body = plainObject(value, "Quote V2 draft request");
  assertAllowedKeys(
    body,
    ["idempotencyKey", "createdJobId", ...QUOTE_PATCH_FIELDS],
    "Quote V2 draft request",
  );
  const { idempotencyKey: rawKey, createdJobId: rawJobId, ...rawPatch } = body;
  return {
    idempotencyKey: idempotencyKey(rawKey),
    ...(rawJobId === undefined
      ? {}
      : { createdJobId: nullableUuid(rawJobId, "Quote V2 draft request.createdJobId") }),
    quotePatch: quotePatch(rawPatch, "Quote V2 draft request", true),
  };
}

export function parseSalesQuoteV2StructureBody(
  value: unknown,
): Readonly<{
  expectedRevision: number;
  idempotencyKey: string;
  operations: readonly QuoteV2StructureOperation[];
}> {
  const body = plainObject(value, "Quote V2 structural request");
  assertAllowedKeys(
    body,
    ["expectedRevision", "idempotencyKey", "operations"],
    "Quote V2 structural request",
  );
  const expectedRevision = safeInteger(
    body.expectedRevision,
    "expectedRevision",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (
    !Array.isArray(body.operations) ||
    body.operations.length < 1 ||
    body.operations.length > 200
  ) {
    throw new CrmAuthError(
      400,
      "operations must contain between 1 and 200 entries.",
    );
  }
  return {
    expectedRevision,
    idempotencyKey: idempotencyKey(body.idempotencyKey),
    operations: body.operations.map(parseOperation),
  };
}

function databaseErrorStatus(error: unknown): number {
  const source = plainObjectOrNull(error);
  const code = typeof source?.code === "string" ? source.code : "";
  const message = typeof source?.message === "string" ? source.message : "";
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (
    code === "40001" ||
    code === "23503" ||
    code === "23505" ||
    code === "23514" ||
    code === "55000" ||
    /revision|idempotency|locked|draft|selected design/i.test(message)
  ) {
    return 409;
  }
  if (code === "22023" || code === "22P02") return 400;
  return 502;
}

function plainObjectOrNull(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function databaseMutationError(error: unknown, fallback: string): CrmAuthError {
  const status = databaseErrorStatus(error);
  if (status === 409) {
    return new CrmAuthError(
      status,
      "This Quote V2 draft changed or is no longer editable. Reload it and try again.",
    );
  }
  if (status === 403) {
    return new CrmAuthError(status, "This CRM account cannot change Quote V2 drafts.");
  }
  if (status === 404) {
    return new CrmAuthError(status, "The Quote V2 draft or one of its rows was not found.");
  }
  if (status === 400) {
    return new CrmAuthError(status, "The Quote V2 structural request was rejected.");
  }
  return new CrmAuthError(status, fallback);
}

function positiveRevision(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new CrmAuthError(502, `${label} returned an invalid revision.`);
  }
  return parsed;
}

function nonnegativeInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CrmAuthError(502, `${label} returned an invalid count.`);
  }
  return parsed;
}

function rpcObject(value: unknown, label: string): JsonObject {
  const row = Array.isArray(value) ? value[0] : value;
  const result = plainObjectOrNull(row);
  if (!result) {
    throw new CrmAuthError(502, `${label} returned no result.`);
  }
  return result;
}

function safeOperationResult(value: unknown): JsonObject {
  const source = plainObjectOrNull(value);
  if (!source) {
    throw new CrmAuthError(
      502,
      "Quote V2 structural persistence returned an invalid operation result.",
    );
  }
  const result: JsonObject = {};
  for (const key of [
    "index",
    "type",
    "lineItemId",
    "sourceLineItemId",
    "targetLineItemId",
    "designId",
    "selectedDesignId",
    "variant",
    "selected",
    "designsCleared",
    "deletedLineCount",
  ]) {
    if (key in source) result[key] = source[key];
  }
  if (Array.isArray(source.designs)) {
    result.designs = source.designs.map((entry) => {
      const design = plainObjectOrNull(entry) ?? {};
      return {
        sourceDesignId: design.sourceDesignId ?? null,
        designId: design.designId ?? null,
        variant: design.variant ?? null,
      };
    });
  }
  return result;
}

export async function createSalesQuoteV2Draft(
  supabase: SupabaseClient,
  actorIdValue: string,
  input: ReturnType<typeof parseCreateSalesQuoteV2DraftBody>,
): Promise<QuoteV2CreateDraftResponse> {
  const actorId = uuid(actorIdValue, "actorId");
  const { data, error } = input.createdJobId
    ? await supabase.rpc("create_mobile_quote_v2_draft", {
        p_idempotency_key: input.idempotencyKey,
        p_actor_id: actorId,
        p_created_job_id: input.createdJobId,
        p_quote_patch: input.quotePatch,
      })
    : await supabase.rpc("create_quote_v2_draft", {
        p_idempotency_key: input.idempotencyKey,
        p_actor_id: actorId,
        p_quote_patch: input.quotePatch,
      });
  if (error) {
    throw databaseMutationError(
      error,
      "The authoritative Quote V2 draft could not be created.",
    );
  }
  const result = rpcObject(data, "Quote V2 draft creation");
  const quoteId = uuid(result.quoteId, "Quote V2 draft quoteId");
  const quoteNumber = requiredText(
    result.quoteNumber,
    "Quote V2 draft quoteNumber",
    100,
  );
  if (
    result.backend !== "authoritative_v2" ||
    result.status !== "draft" ||
    result.quoteV2Status !== "draft" ||
    nonnegativeInteger(result.lineCount, "Quote V2 draft") !== 0
  ) {
    throw new CrmAuthError(
      502,
      "Quote V2 draft creation returned an inconsistent lifecycle state.",
    );
  }
  return {
    backend: "authoritative_v2",
    quoteId,
    quoteNumber,
    revision: positiveRevision(result.revision, "Quote V2 draft creation"),
    status: "draft",
    quoteV2Status: "draft",
    lineCount: 0,
  };
}

export async function mutateSalesQuoteV2Structure(
  supabase: SupabaseClient,
  quoteIdValue: string,
  actorIdValue: string,
  input: ReturnType<typeof parseSalesQuoteV2StructureBody>,
): Promise<QuoteV2StructureResponse> {
  const quoteId = uuid(quoteIdValue, "quoteId");
  const actorId = uuid(actorIdValue, "actorId");
  const { data, error } = await supabase.rpc("mutate_quote_v2_structure", {
    p_quote_id: quoteId,
    p_expected_revision: input.expectedRevision,
    p_idempotency_key: input.idempotencyKey,
    p_actor_id: actorId,
    p_operations: input.operations,
  });
  if (error) {
    throw databaseMutationError(
      error,
      "The authoritative Quote V2 draft could not be changed.",
    );
  }
  const result = rpcObject(data, "Quote V2 structural persistence");
  if (
    result.backend !== "authoritative_v2" ||
    result.quoteId !== quoteId ||
    result.status !== "draft" ||
    (result.quoteV2Status !== "draft" && result.quoteV2Status !== "stale")
  ) {
    throw new CrmAuthError(
      502,
      "Quote V2 structural persistence returned an inconsistent identity or lifecycle.",
    );
  }
  const rawSelections = plainObjectOrNull(result.selectedDesigns) ?? {};
  const selectedDesigns: Record<string, string | null> = {};
  for (const [lineItemId, designId] of Object.entries(rawSelections)) {
    const normalizedLineId = uuid(lineItemId, "selectedDesigns lineItemId");
    selectedDesigns[normalizedLineId] =
      designId === null ? null : uuid(designId, "selectedDesigns designId");
  }
  const lineCount = nonnegativeInteger(
    result.lineCount,
    "Quote V2 structural persistence",
  );
  if (
    Object.keys(selectedDesigns).length !== lineCount ||
    Object.values(selectedDesigns).some((designId) => designId === null)
  ) {
    throw new CrmAuthError(
      502,
      "Quote V2 structural persistence returned an incomplete selected-design map.",
    );
  }
  if (!Array.isArray(result.operations)) {
    throw new CrmAuthError(
      502,
      "Quote V2 structural persistence returned no operation results.",
    );
  }
  return {
    backend: "authoritative_v2",
    quoteId,
    revision: positiveRevision(result.revision, "Quote V2 structural persistence"),
    status: "draft",
    quoteV2Status: result.quoteV2Status,
    lineCount,
    selectedDesigns,
    operations: result.operations.map(safeOperationResult),
  };
}
