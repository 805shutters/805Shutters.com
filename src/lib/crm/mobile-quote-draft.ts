import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { ACCOUNT_IDS } from "@mts/lib/accounts";

export const MOBILE_QUOTE_ACCOUNT_ID = ACCOUNT_IDS.SHUTTERS_805;
export const MOBILE_QUOTE_FRACTIONS = [
  "0", "1/16", "1/8", "3/16", "1/4", "5/16", "3/8", "7/16",
  "1/2", "9/16", "5/8", "11/16", "3/4", "13/16", "7/8", "15/16",
] as const;

export type MobileQuoteCustomer = {
  kind: "existing" | "new";
  jobId: string | null;
  sourceId?: string | null;
  name: string;
  phone: string;
  email: string;
  address: string;
  appointmentDate: string | null;
};

export type MobileQuotePhoto = {
  id: string;
  name: string;
  type: string;
  blob: Blob;
};

export type MobileQuotePrice = {
  amount: number;
  status: "authoritative" | "blocked" | "unpriceable";
  fingerprint: string;
  verifiedAt: string;
  blockedReason?: string | null;
};

export type MobileQuoteTotal = {
  amount: number;
  status: "authoritative" | "blocked" | "unpriceable";
  fingerprint: string;
  verifiedAt: string;
};

export type MobileQuoteFamilyConfiguration = {
  productId: string;
  productType: string;
  design: SalesQuoteDesign;
  overriddenPaths: string[];
};

export type MobileQuoteWindow = {
  id: string;
  room: string;
  position: string;
  widthWhole: number;
  widthFraction: string;
  heightWhole: number;
  heightFraction: string;
  notes: string;
  activeProductId: string | null;
  families: Record<string, MobileQuoteFamilyConfiguration>;
  photos: MobileQuotePhoto[];
  price: MobileQuotePrice | null;
  saved: boolean;
};

export type MobileQuoteSubmissionSnapshot = {
  customer: MobileQuoteCustomer;
  windows: MobileQuoteWindow[];
  createdAt: string;
  requiresManualPricing: boolean;
};

export type MobileQuoteSubmission = {
  createKey: string;
  structureKey: string;
  priceKey: string;
  quoteId: string | null;
  quoteNumber: string | null;
  createRevision: number | null;
  structureRevision: number | null;
  uploadedPhotoIds: string[];
  priceStatus: "authoritative" | "blocked" | "unpriceable" | null;
  finalTotal: number | null;
  snapshot: MobileQuoteSubmissionSnapshot | null;
  completedAt: string | null;
};

export type MobileQuoteDraft = {
  id: string;
  owner: string;
  customer: MobileQuoteCustomer;
  windows: MobileQuoteWindow[];
  activeWindowId: string;
  firstLineDefaults: MobileQuoteFamilyConfiguration | null;
  quotePrice: MobileQuoteTotal | null;
  submission: MobileQuoteSubmission;
  updatedAt: string;
};

export type MobileQuoteGridSelection = {
  windowId: string;
  side: "width" | "height";
  whole: number;
  fraction: string;
  step: "whole" | "fraction";
};

export function beginMobileQuoteGridSelection(
  window: MobileQuoteWindow,
  side: MobileQuoteGridSelection["side"],
): MobileQuoteGridSelection {
  return {
    windowId: window.id,
    side,
    whole: side === "width" ? window.widthWhole : window.heightWhole,
    fraction: side === "width" ? window.widthFraction : window.heightFraction,
    step: "whole",
  };
}

export function chooseMobileQuoteGridWhole(
  selection: MobileQuoteGridSelection,
  whole: number,
): MobileQuoteGridSelection {
  return { ...selection, whole, step: "fraction" };
}

export function commitMobileQuoteGridSelection(
  draft: MobileQuoteDraft,
  selection: MobileQuoteGridSelection,
  fraction: string,
  updatedAt = new Date().toISOString(),
): MobileQuoteDraft {
  const index = draft.windows.findIndex((window) => window.id === selection.windowId);
  if (index < 0) return draft;
  const next = structuredClone(draft);
  const line = next.windows[index];
  if (selection.side === "width") {
    line.widthWhole = selection.whole;
    line.widthFraction = fraction;
  } else {
    line.heightWhole = selection.whole;
    line.heightFraction = fraction;
  }
  line.saved = false;
  line.price = null;
  next.quotePrice = null;
  next.updatedAt = updatedAt;
  return next;
}

function id() {
  return crypto.randomUUID();
}

export function normalizeMobileQuoteDraft(draft: MobileQuoteDraft): MobileQuoteDraft {
  return {
    ...draft,
    quotePrice: draft.quotePrice || null,
    submission: {
      ...draft.submission,
      createRevision: draft.submission.createRevision ?? null,
      structureRevision: draft.submission.structureRevision ?? null,
      uploadedPhotoIds: draft.submission.uploadedPhotoIds || [],
      priceStatus: draft.submission.priceStatus || null,
      finalTotal: draft.submission.finalTotal ?? null,
      snapshot: draft.submission.snapshot
        ? {
            ...draft.submission.snapshot,
            requiresManualPricing: draft.submission.snapshot.requiresManualPricing === true,
          }
        : null,
    },
  };
}

export function isQuoteEditorHandoffReady(draft: Pick<MobileQuoteDraft, "submission">): boolean {
  const { submission } = draft;
  const snapshot = submission.snapshot;
  if (
    !snapshot ||
    !submission.quoteId ||
    submission.structureRevision === null ||
    (submission.priceStatus !== "blocked" && submission.priceStatus !== "unpriceable") ||
    (snapshot.requiresManualPricing && !submission.completedAt)
  ) {
    return false;
  }
  const uploadedPhotoIds = new Set(submission.uploadedPhotoIds);
  return snapshot.windows.every((window) =>
    window.photos.every((photo) => uploadedPhotoIds.has(photo.id)),
  );
}

export function isManualQuoteEditorHandoffReady(draft: Pick<MobileQuoteDraft, "submission">): boolean {
  return draft.submission.snapshot?.requiresManualPricing === true && isQuoteEditorHandoffReady(draft);
}

export function isMobileQuoteDraftAccessible(draft: MobileQuoteDraft): boolean {
  return !draft.submission.completedAt || draft.submission.snapshot?.requiresManualPricing === true;
}

export function emptyMobileQuoteDesign(lineItemId: string, productType: string): SalesQuoteDesign {
  return {
    id: id(), line_item_id: lineItemId, variant: "A", product_type: productType,
    supplier: null, material: null, louver_size: null, tilt_type: null,
    hinge_color: null, panel_config: null, mount_type: null, shade_type: null,
    lift_system: null, valance: null, fabric: null, motor_type: null,
    remote_type: null, hard_surface_install: false, ladder_over_15ft: false,
    requires_takedown: false, unit_price: 0, notes: null, options_json: {},
    created_at: new Date().toISOString(),
  };
}

export function newMobileQuoteWindow(defaults: MobileQuoteFamilyConfiguration | null = null): MobileQuoteWindow {
  const windowId = id();
  const family = defaults ? structuredClone(defaults) : null;
  if (family) {
    family.design.id = id();
    family.design.line_item_id = windowId;
    family.overriddenPaths = [];
  }
  return {
    id: windowId, room: "", position: "", widthWhole: 0, widthFraction: "0",
    heightWhole: 0, heightFraction: "0", notes: "", activeProductId: family?.productId ?? null,
    families: family ? { [family.productId]: family } : {}, photos: [], price: null, saved: false,
  };
}

export function createMobileQuoteDraft(owner: string, customer: MobileQuoteCustomer): MobileQuoteDraft {
  const first = newMobileQuoteWindow();
  return {
    id: id(), owner, customer, windows: [first], activeWindowId: first.id,
    firstLineDefaults: null,
    quotePrice: null,
    submission: {
      createKey: `mobile-create:${id()}`, structureKey: `mobile-structure:${id()}`,
      priceKey: `mobile-price:${id()}`, quoteId: null, quoteNumber: null,
      createRevision: null, structureRevision: null, uploadedPhotoIds: [], priceStatus: null,
      finalTotal: null, snapshot: null, completedAt: null,
    },
    updatedAt: new Date().toISOString(),
  };
}

function familyClone(configuration: MobileQuoteFamilyConfiguration, lineItemId: string) {
  const next = structuredClone(configuration);
  next.design.id = id();
  next.design.line_item_id = lineItemId;
  return next;
}

function changedDesignPaths(before: SalesQuoteDesign, after: SalesQuoteDesign) {
  const paths: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete("id"); keys.delete("line_item_id"); keys.delete("created_at"); keys.delete("unit_price");
  for (const key of keys) {
    if (key === "options_json") {
      const left = before.options_json || {};
      const right = after.options_json || {};
      for (const option of new Set([...Object.keys(left), ...Object.keys(right)])) {
        if (JSON.stringify(left[option]) !== JSON.stringify(right[option])) paths.push(`options_json.${option}`);
      }
    } else if (JSON.stringify(before[key as keyof SalesQuoteDesign]) !== JSON.stringify(after[key as keyof SalesQuoteDesign])) {
      paths.push(key);
    }
  }
  return paths;
}

function copyPath(target: SalesQuoteDesign, source: SalesQuoteDesign, path: string) {
  if (path.startsWith("options_json.")) {
    const key = path.slice("options_json.".length);
    target.options_json = { ...(target.options_json || {}) };
    if (Object.prototype.hasOwnProperty.call(source.options_json || {}, key)) target.options_json[key] = source.options_json[key];
    else delete target.options_json[key];
    return;
  }
  (target as unknown as Record<string, unknown>)[path] = (source as unknown as Record<string, unknown>)[path];
}

export function selectMobileQuoteProduct(
  draft: MobileQuoteDraft,
  lineId: string,
  configuration: Omit<MobileQuoteFamilyConfiguration, "overriddenPaths">,
): MobileQuoteDraft {
  const next = structuredClone(draft);
  const index = next.windows.findIndex((line) => line.id === lineId);
  if (index < 0) return draft;
  const source = next.windows[index];
  const retained = source.families[configuration.productId];
  source.families[configuration.productId] = retained || { ...familyClone({ ...configuration, overriddenPaths: [] }, source.id), overriddenPaths: [] };
  source.activeProductId = configuration.productId;
  source.price = null;
  source.saved = false;

  if (index === 0) {
    const selected = source.families[configuration.productId];
    next.firstLineDefaults = familyClone(selected, source.id);
    next.firstLineDefaults.overriddenPaths = [];
    for (const target of next.windows.slice(1)) {
      target.activeProductId = configuration.productId;
      const existingTarget = target.families[configuration.productId];
      if (!existingTarget) {
        target.families[configuration.productId] = familyClone(selected, target.id);
        target.families[configuration.productId].overriddenPaths = [];
      } else {
        for (const path of changedDesignPaths(existingTarget.design, selected.design)) {
          if (!existingTarget.overriddenPaths.includes(path)) copyPath(existingTarget.design, selected.design, path);
        }
        existingTarget.productType = selected.productType;
      }
      target.price = null;
      target.saved = false;
    }
  }
  next.quotePrice = null;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function updateMobileQuoteDesign(
  draft: MobileQuoteDraft,
  lineId: string,
  incoming: Partial<SalesQuoteDesign>,
): MobileQuoteDraft {
  const next = structuredClone(draft);
  const index = next.windows.findIndex((line) => line.id === lineId);
  const line = next.windows[index];
  if (!line?.activeProductId) return draft;
  const family = line.families[line.activeProductId];
  if (!family) return draft;
  const before = family.design;
  const after = { ...before, ...incoming, options_json: incoming.options_json ? { ...incoming.options_json } : before.options_json };
  const paths = changedDesignPaths(before, after);
  family.design = after;
  line.price = null;
  line.saved = false;

  if (index === 0) {
    next.firstLineDefaults = familyClone(family, line.id);
    next.firstLineDefaults.overriddenPaths = [];
    for (const target of next.windows.slice(1)) {
      const targetFamily = target.families[family.productId];
      if (!targetFamily) continue;
      for (const path of paths) {
        if (!targetFamily.overriddenPaths.includes(path)) copyPath(targetFamily.design, after, path);
      }
      if (target.activeProductId === family.productId) {
        target.price = null;
        target.saved = false;
      }
    }
  } else {
    family.overriddenPaths = [...new Set([...family.overriddenPaths, ...paths])];
  }
  next.quotePrice = null;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function allowsNeedsPricingDraft(
  expectedWindowIds: readonly string[],
  authoritativeWindowIds: ReadonlySet<string>,
  manualPricingWindowIds: ReadonlySet<string>,
) {
  const unresolved = expectedWindowIds.filter((id) => !authoritativeWindowIds.has(id));
  return unresolved.length > 0 && unresolved.every((id) => manualPricingWindowIds.has(id));
}

export type MobileQuotePreflightLine = Readonly<{
  lineItemId: string;
  status: "authoritative" | "blocked" | "unpriceable";
  requiresManualPricing: boolean;
}>;

export function mobileQuotePreflightOutcome(
  expectedWindowIds: readonly string[],
  lines: readonly MobileQuotePreflightLine[],
) {
  const expected = new Set(expectedWindowIds);
  const responseCounts = new Map<string, number>();
  for (const line of lines) {
    responseCounts.set(line.lineItemId, (responseCounts.get(line.lineItemId) ?? 0) + 1);
  }
  const hasExactCoverage =
    expected.size === expectedWindowIds.length &&
    lines.length === expectedWindowIds.length &&
    lines.every((line) => expected.has(line.lineItemId)) &&
    expectedWindowIds.every((id) => responseCounts.get(id) === 1);
  if (!hasExactCoverage) {
    return {
      allowed: false,
      requiresManualPricing: false,
      authoritativeWindowIds: new Set<string>(),
      manualPricingWindowIds: new Set<string>(),
    } as const;
  }

  const authoritativeWindowIds = new Set(
    lines.filter((line) => line.status === "authoritative" && !line.requiresManualPricing)
      .map((line) => line.lineItemId),
  );
  const manualPricingWindowIds = new Set(
    lines.filter((line) => line.status !== "authoritative" && line.requiresManualPricing)
      .map((line) => line.lineItemId),
  );
  const allowed = expectedWindowIds.every(
    (id) => authoritativeWindowIds.has(id) || manualPricingWindowIds.has(id),
  );

  return {
    allowed,
    requiresManualPricing: allowed && manualPricingWindowIds.size > 0,
    authoritativeWindowIds,
    manualPricingWindowIds,
  } as const;
}

export function appendMobileQuotePhoto(
  draft: MobileQuoteDraft,
  draftId: string,
  windowId: string,
  photo: MobileQuotePhoto,
): MobileQuoteDraft {
  if (draft.id !== draftId || draft.submission.snapshot) return draft;
  const index = draft.windows.findIndex((window) => window.id === windowId);
  if (index < 0 || draft.windows[index].photos.some((existing) => existing.id === photo.id)) return draft;
  const next = structuredClone(draft);
  next.windows[index].photos.push(photo);
  next.windows[index].saved = false;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function removeMobileQuoteWindow(draft: MobileQuoteDraft, windowId: string): MobileQuoteDraft {
  if (draft.submission.snapshot || draft.windows.length <= 1) return draft;
  const removedIndex = draft.windows.findIndex((window) => window.id === windowId);
  if (removedIndex < 0) return draft;
  const next = structuredClone(draft);
  next.windows.splice(removedIndex, 1);
  const nextActive = next.windows[Math.min(removedIndex, next.windows.length - 1)];
  if (draft.activeWindowId === windowId) next.activeWindowId = nextActive.id;
  if (removedIndex === 0) {
    const activeFamily = nextActive.activeProductId ? nextActive.families[nextActive.activeProductId] : null;
    next.firstLineDefaults = activeFamily ? familyClone({ ...activeFamily, overriddenPaths: [] }, nextActive.id) : null;
  }
  next.quotePrice = null;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function addMobileQuoteWindow(draft: MobileQuoteDraft) {
  const next = structuredClone(draft);
  const line = newMobileQuoteWindow(next.firstLineDefaults);
  next.windows.push(line);
  next.activeWindowId = line.id;
  next.quotePrice = null;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function mobileQuoteLine(draft: MobileQuoteDraft, window: MobileQuoteWindow): SalesQuoteLineItem {
  const family = window.activeProductId ? window.families[window.activeProductId] : null;
  return {
    id: window.id, quote_id: draft.submission.quoteId || draft.id, room_name: window.room,
    product_type: family?.productType || "", width_whole: window.widthWhole,
    width_fraction: window.widthFraction, height_whole: window.heightWhole,
    height_fraction: window.heightFraction, quantity: 1,
    sort_order: draft.windows.findIndex((candidate) => candidate.id === window.id),
    selected_design_id: family?.design.id || null, created_at: draft.updatedAt,
  };
}

export function mobileQuoteFingerprint(window: MobileQuoteWindow) {
  const family = window.activeProductId ? window.families[window.activeProductId] : null;
  return JSON.stringify({
    productId: window.activeProductId, dimensions: [window.widthWhole, window.widthFraction, window.heightWhole, window.heightFraction],
    design: family?.design || null,
  });
}

export function validateMobileQuoteWindow(window: MobileQuoteWindow) {
  if (!window.activeProductId || !window.families[window.activeProductId]) return "Choose a product.";
  if (!window.room.trim()) return "Enter a room name.";
  if (!Number.isInteger(window.widthWhole) || !Number.isInteger(window.heightWhole)) return "Measurements must use whole inches plus a fraction.";
  if (!MOBILE_QUOTE_FRACTIONS.includes(window.widthFraction as (typeof MOBILE_QUOTE_FRACTIONS)[number]) ||
      !MOBILE_QUOTE_FRACTIONS.includes(window.heightFraction as (typeof MOBILE_QUOTE_FRACTIONS)[number])) {
    return "Choose a supported measurement fraction.";
  }
  const fraction = (value: string) => {
    if (value === "0") return 0;
    const [numerator, denominator] = value.split("/").map(Number);
    return numerator / denominator;
  };
  const width = window.widthWhole + fraction(window.widthFraction);
  const height = window.heightWhole + fraction(window.heightFraction);
  if (!(width > 0 && height > 0 && width <= 1000 && height <= 1000)) return "Enter a width and height greater than zero and no more than 1,000 inches.";
  return null;
}
