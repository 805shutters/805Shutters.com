import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { ACCOUNT_IDS } from "@mts/lib/accounts";

export const MOBILE_QUOTE_ACCOUNT_ID = ACCOUNT_IDS.SHUTTERS_805;
export const MOBILE_QUOTE_ROOM_PRESETS = [
  "Living room", "Family room", "Dining room", "Kitchen", "Bathroom", "Bedroom",
  "Primary", "Primary bath", "Den", "Office", "Entry", "Door", "Garage", "Gym", "Custom",
] as const;
export const MOBILE_QUOTE_WINDOW_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
export type MobileQuoteRoomChoice = (typeof MOBILE_QUOTE_ROOM_PRESETS)[number];

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

export type MobileQuoteWorkflowMode = "measure-first" | "full-design";
export type MobileQuoteWorkflowPhase = "measure" | "assign" | "groups";

export type MobileQuoteWindow = {
  id: string;
  room: string;
  position: string;
  /** Local-only selection intent; absent on historical drafts. */
  roomChoice?: MobileQuoteRoomChoice | null;
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
  /** Local-only workflow state; historical drafts intentionally omit these fields. */
  workflowMode?: MobileQuoteWorkflowMode;
  workflowPhase?: MobileQuoteWorkflowPhase;
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
    workflowMode: draft.workflowMode === "measure-first" ? "measure-first" : "full-design",
    workflowPhase: draft.workflowMode === "measure-first" && (draft.workflowPhase === "assign" || draft.workflowPhase === "groups")
      ? draft.workflowPhase
      : "measure",
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
    id: windowId, room: "", position: "", roomChoice: null, widthWhole: 0, widthFraction: "0",
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
    workflowMode: "full-design",
    workflowPhase: "measure",
  };
}

export function mobileQuoteWorkflowMode(draft: Pick<MobileQuoteDraft, "workflowMode">): MobileQuoteWorkflowMode {
  return draft.workflowMode === "measure-first" ? "measure-first" : "full-design";
}

export function setMobileQuoteWorkflow(
  draft: MobileQuoteDraft,
  mode: MobileQuoteWorkflowMode,
  phase: MobileQuoteWorkflowPhase = "measure",
  updatedAt = new Date().toISOString(),
) {
  if (draft.submission.snapshot || mobileQuoteWorkflowMode(draft) === mode) return draft;
  const next = structuredClone(draft);
  next.workflowMode = mode;
  next.workflowPhase = phase;
  if (mode === "full-design") {
    const first = next.windows[0];
    const activeFamily = first?.activeProductId ? first.families[first.activeProductId] : null;
    next.firstLineDefaults = activeFamily ? familyClone(activeFamily, first.id) : null;
    if (next.firstLineDefaults) next.firstLineDefaults.overriddenPaths = [];
  }
  next.updatedAt = updatedAt;
  return next;
}

export function setMobileQuoteWorkflowPhase(
  draft: MobileQuoteDraft,
  phase: MobileQuoteWorkflowPhase,
  updatedAt = new Date().toISOString(),
) {
  if (draft.submission.snapshot || mobileQuoteWorkflowMode(draft) !== "measure-first") return draft;
  const next = structuredClone(draft);
  next.workflowPhase = phase;
  next.updatedAt = updatedAt;
  return next;
}

function familyClone(configuration: MobileQuoteFamilyConfiguration, lineItemId: string) {
  const next = structuredClone(configuration);
  next.design.id = id();
  next.design.line_item_id = lineItemId;
  return next;
}

export function changedMobileQuoteDesignPaths(before: SalesQuoteDesign, after: SalesQuoteDesign) {
  const paths: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const ignored of ["id", "line_item_id", "unit_price", "created_at", "updated_at"]) keys.delete(ignored);
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

export function mobileQuoteDesignsMixed(designs: readonly SalesQuoteDesign[]) {
  const reference = designs[0];
  return Boolean(reference && designs.slice(1).some((design) => changedMobileQuoteDesignPaths(reference, design).length > 0));
}

function copyPath(target: SalesQuoteDesign, source: SalesQuoteDesign, path: string) {
  if (path.startsWith("options_json.")) {
    const key = path.slice("options_json.".length);
    target.options_json = { ...(target.options_json || {}) };
    if (Object.prototype.hasOwnProperty.call(source.options_json || {}, key)) target.options_json[key] = structuredClone(source.options_json[key]);
    else delete target.options_json[key];
    return;
  }
  (target as unknown as Record<string, unknown>)[path] = structuredClone((source as unknown as Record<string, unknown>)[path]);
}

export function selectMobileQuoteProduct(
  draft: MobileQuoteDraft,
  lineId: string,
  configuration: Omit<MobileQuoteFamilyConfiguration, "overriddenPaths">,
): MobileQuoteDraft {
  if (draft.submission.snapshot) return draft;
  const next = structuredClone(draft);
  const index = next.windows.findIndex((line) => line.id === lineId);
  if (index < 0) return draft;
  const source = next.windows[index];
  const retained = source.families[configuration.productId];
  source.families[configuration.productId] = retained || { ...familyClone({ ...configuration, overriddenPaths: [] }, source.id), overriddenPaths: [] };
  source.activeProductId = configuration.productId;
  source.price = null;
  source.saved = false;

  if (index === 0 && mobileQuoteWorkflowMode(draft) === "full-design") {
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
        for (const path of changedMobileQuoteDesignPaths(existingTarget.design, selected.design)) {
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
  if (draft.submission.snapshot) return draft;
  const next = structuredClone(draft);
  const index = next.windows.findIndex((line) => line.id === lineId);
  const line = next.windows[index];
  if (!line?.activeProductId) return draft;
  const family = line.families[line.activeProductId];
  if (!family) return draft;
  const before = family.design;
  const after = { ...before, ...incoming, options_json: incoming.options_json ? { ...incoming.options_json } : before.options_json };
  const paths = changedMobileQuoteDesignPaths(before, after);
  family.design = after;
  line.price = null;
  line.saved = false;

  if (index === 0 && mobileQuoteWorkflowMode(draft) === "full-design") {
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
  if (draft.submission.snapshot) return draft;
  const next = structuredClone(draft);
  const line = newMobileQuoteWindow(mobileQuoteWorkflowMode(next) === "full-design" ? next.firstLineDefaults : null);
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


const MOBILE_QUOTE_PRESET_ROOM_SET = new Set<string>(
  MOBILE_QUOTE_ROOM_PRESETS.filter((room) => room !== "Custom"),
);
const MOBILE_QUOTE_BEDROOM_PATTERN = /^Bedroom [1-5]$/;

export function mobileQuoteRoomChoice(window: Pick<MobileQuoteWindow, "room" | "roomChoice">): MobileQuoteRoomChoice | null {
  if (window.roomChoice) return window.roomChoice;
  const room = window.room.trim();
  if (!room) return null;
  if (MOBILE_QUOTE_BEDROOM_PATTERN.test(room)) return "Bedroom";
  if (MOBILE_QUOTE_PRESET_ROOM_SET.has(room)) return room as MobileQuoteRoomChoice;
  return "Custom";
}

export function hasConcreteMobileQuoteRoom(window: Pick<MobileQuoteWindow, "room" | "roomChoice">) {
  const choice = mobileQuoteRoomChoice(window);
  if (!choice) return false;
  if (choice === "Custom") return Boolean(window.room.trim());
  if (choice === "Bedroom") {
    return MOBILE_QUOTE_BEDROOM_PATTERN.test(window.room.trim()) ||
      (window.roomChoice === undefined && window.room.trim() === "Bedroom");
  }
  return true;
}

function retainLegacyPositionOnRoomChange(position: string) {
  return MOBILE_QUOTE_WINDOW_LETTERS.includes(position as (typeof MOBILE_QUOTE_WINDOW_LETTERS)[number]) ? "" : position;
}

function updateRoomWindow(
  draft: MobileQuoteDraft,
  windowId: string,
  update: (window: MobileQuoteWindow) => void,
  updatedAt = new Date().toISOString(),
) {
  if (draft.submission.snapshot) return draft;
  const index = draft.windows.findIndex((window) => window.id === windowId);
  if (index < 0) return draft;
  const next = structuredClone(draft);
  const window = next.windows[index];
  update(window);
  window.saved = false;
  window.price = null;
  next.quotePrice = null;
  next.updatedAt = updatedAt;
  return next;
}

export function selectMobileQuoteRoom(
  draft: MobileQuoteDraft,
  windowId: string,
  choice: MobileQuoteRoomChoice,
  updatedAt?: string,
) {
  const window = draft.windows.find((candidate) => candidate.id === windowId);
  if (!window || mobileQuoteRoomChoice(window) === choice) return draft;
  return updateRoomWindow(draft, windowId, (window) => {
    const previousChoice = mobileQuoteRoomChoice(window);
    window.position = retainLegacyPositionOnRoomChange(window.position);
    window.roomChoice = choice;
    if (choice === "Custom") {
      if (previousChoice !== "Custom") window.room = "";
    } else {
      window.room = choice;
    }
  }, updatedAt);
}

export function selectMobileQuoteBedroomNumber(
  draft: MobileQuoteDraft,
  windowId: string,
  bedroom: string,
  updatedAt?: string,
) {
  if (!MOBILE_QUOTE_BEDROOM_PATTERN.test(bedroom)) return draft;
  const window = draft.windows.find((candidate) => candidate.id === windowId);
  if (!window || (mobileQuoteRoomChoice(window) === "Bedroom" && window.room === bedroom)) return draft;
  return updateRoomWindow(draft, windowId, (window) => {
    window.position = retainLegacyPositionOnRoomChange(window.position);
    window.roomChoice = "Bedroom";
    window.room = bedroom;
  }, updatedAt);
}

export function updateMobileQuoteCustomRoom(
  draft: MobileQuoteDraft,
  windowId: string,
  room: string,
  updatedAt?: string,
) {
  return updateRoomWindow(draft, windowId, (window) => {
    window.roomChoice = "Custom";
    window.room = room;
  }, updatedAt);
}

export function selectMobileQuoteWindowLetter(
  draft: MobileQuoteDraft,
  windowId: string,
  letter: string,
  updatedAt?: string,
) {
  if (!MOBILE_QUOTE_WINDOW_LETTERS.includes(letter as (typeof MOBILE_QUOTE_WINDOW_LETTERS)[number])) return draft;
  const window = draft.windows.find((candidate) => candidate.id === windowId);
  if (!window || !hasConcreteMobileQuoteRoom(window)) return draft;
  return updateRoomWindow(draft, windowId, (window) => { window.position = letter; }, updatedAt);
}

export function validateMobileQuoteWindow(window: MobileQuoteWindow) {
  if (!window.activeProductId || !window.families[window.activeProductId]) return "Choose a product.";
  return validateMobileQuoteMeasurement(window);
}

export function validateMobileQuoteMeasurement(window: MobileQuoteWindow) {
  if (!window.room.trim()) return "Choose a room.";
  if (window.roomChoice === "Bedroom" && !MOBILE_QUOTE_BEDROOM_PATTERN.test(window.room.trim())) return "Choose Bedroom 1 through Bedroom 5.";
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

export function isUntouchedMobileQuoteWindow(window: MobileQuoteWindow) {
  return !window.activeProductId && Object.keys(window.families).length === 0 && !window.roomChoice &&
    !window.room.trim() && !window.position.trim() && window.widthWhole === 0 && window.widthFraction === "0" &&
    window.heightWhole === 0 && window.heightFraction === "0" && !window.notes.trim() && window.photos.length === 0;
}

export function omitTrailingUntouchedMobileQuoteWindow(draft: MobileQuoteDraft, updatedAt = new Date().toISOString()) {
  if (draft.submission.snapshot || draft.windows.length < 2 || !isUntouchedMobileQuoteWindow(draft.windows.at(-1)!)) return draft;
  const realWindows = draft.windows.slice(0, -1);
  if (!realWindows.some((window) => !isUntouchedMobileQuoteWindow(window))) return draft;
  const next = structuredClone(draft);
  const removed = next.windows.pop()!;
  if (next.activeWindowId === removed.id) next.activeWindowId = next.windows.at(-1)!.id;
  next.updatedAt = updatedAt;
  return next;
}

export function beginMobileQuoteMeasureMore(draft: MobileQuoteDraft, updatedAt = new Date().toISOString()) {
  if (draft.submission.snapshot || mobileQuoteWorkflowMode(draft) !== "measure-first") return draft;
  let next = setMobileQuoteWorkflowPhase(draft, "measure", updatedAt);
  const untouched = next.windows.find((line) => isUntouchedMobileQuoteWindow(line));
  if (untouched) return next.activeWindowId === untouched.id ? next : { ...next, activeWindowId: untouched.id };
  next = addMobileQuoteWindow(next);
  next.updatedAt = updatedAt;
  return next;
}

export function validMobileQuoteSelectionIds(
  draft: Pick<MobileQuoteDraft, "windows">,
  selectedIds: readonly string[],
  productId?: string | null,
) {
  const selected = new Set(selectedIds);
  return draft.windows
    .filter((line) => selected.has(line.id) && (!productId || line.activeProductId === productId))
    .map((line) => line.id);
}

export function assignMobileQuoteProductBatch(
  draft: MobileQuoteDraft,
  selectedIds: readonly string[],
  configuration: Omit<MobileQuoteFamilyConfiguration, "overriddenPaths">,
  updatedAt = new Date().toISOString(),
) {
  if (draft.submission.snapshot || selectedIds.length === 0) return draft;
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length || selectedIds.some((lineId) => !draft.windows.some((line) => line.id === lineId))) return draft;
  const next = structuredClone(draft);
  for (const line of next.windows) {
    if (!selected.has(line.id)) continue;
    if (!line.families[configuration.productId]) {
      line.families[configuration.productId] = familyClone({ ...configuration, overriddenPaths: [] }, line.id);
    }
    line.activeProductId = configuration.productId;
    line.price = null;
    line.saved = false;
  }
  next.quotePrice = null;
  next.updatedAt = updatedAt;
  return next;
}

export function updateMobileQuoteDesignBatch(
  draft: MobileQuoteDraft,
  productId: string,
  selectedIds: readonly string[],
  referenceBefore: SalesQuoteDesign,
  incoming: Partial<SalesQuoteDesign>,
  updatedAt = new Date().toISOString(),
) {
  if (draft.submission.snapshot || selectedIds.length === 0) return draft;
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length) return draft;
  const targets = draft.windows.filter((line) => selected.has(line.id));
  if (targets.length !== selected.size || targets.some((line) => line.activeProductId !== productId || !line.families[productId])) return draft;
  const after = {
    ...referenceBefore,
    ...incoming,
    options_json: incoming.options_json ? { ...incoming.options_json } : referenceBefore.options_json,
  };
  const paths = changedMobileQuoteDesignPaths(referenceBefore, after);
  if (!paths.length) return draft;
  const next = structuredClone(draft);
  for (const line of next.windows) {
    if (!selected.has(line.id)) continue;
    const family = line.families[productId];
    for (const path of paths) copyPath(family.design, after, path);
    family.overriddenPaths = [...new Set([...family.overriddenPaths, ...paths])];
    line.price = null;
    line.saved = false;
  }
  next.quotePrice = null;
  next.updatedAt = updatedAt;
  return next;
}
