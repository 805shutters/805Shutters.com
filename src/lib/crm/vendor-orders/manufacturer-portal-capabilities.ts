import { orderEntryRouteCapability } from "./manufacturer-order-capability-matrix";

export type ManufacturerPortalCapabilityInput = {
  manufacturer: string;
  routingKeys: string[];
  sourceKind?: string | null;
};

export type ManufacturerPortalCapability = {
  automaticEntry: boolean;
  documentPreparation: boolean;
  reviewBoundary: "saved_draft_only";
  reason: string;
};

/**
 * Exact, audited browser-adapter coverage. Product schemas and order packets may
 * exist without a verified portal adapter; those cases must never be presented
 * as autonomous entry.
 */
export function manufacturerPortalCapability(
  input: ManufacturerPortalCapabilityInput,
): ManufacturerPortalCapability {
  const routingKeys = input.routingKeys.map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!routingKeys.length) {
    return {
      automaticEntry: false,
      documentPreparation: false,
      reviewBoundary: "saved_draft_only",
      reason: "Exact product routing is missing, so automatic portal entry is blocked.",
    };
  }

  const routes = routingKeys.map(orderEntryRouteCapability);
  if (routes.some((route) => !route)) {
    return { automaticEntry: false, documentPreparation: false, reviewBoundary: "saved_draft_only", reason: "At least one exact catalog route is absent from the manufacturer capability matrix." };
  }

  if (input.manufacturer === "Norman") {
    const submittedMeasure = input.sourceKind === "submitted_technical_measure";
    const portalReady = routes.every((route) => route?.manufacturer === "Norman" && route.enterOrderMode === "portal_draft");
    return submittedMeasure && portalReady
      ? {
          automaticEntry: true,
          documentPreparation: false,
          reviewBoundary: "saved_draft_only",
          reason: "Verified Norman Roller adapter; stops at the saved-draft review screen.",
        }
      : {
          automaticEntry: false,
          documentPreparation: false,
          reviewBoundary: "saved_draft_only",
          reason: "Automatic Norman entry is verified only for submitted Soluna Roller technical measures.",
        };
  }

  if (input.manufacturer === "Onyx") {
    const onyxReady = routes.every((route) => route?.manufacturer === "Onyx" && route.enterOrderMode === "portal_draft");
    return onyxReady
      ? {
          automaticEntry: true,
          documentPreparation: false,
          reviewBoundary: "saved_draft_only",
          reason: "Verified Onyx shutter adapter; exact material and conditional fields are rechecked before entry.",
        }
      : {
          automaticEntry: false,
          documentPreparation: false,
          reviewBoundary: "saved_draft_only",
          reason: "At least one Onyx product lacks an exact portal material mapping, so automatic entry is blocked.",
        };
  }

  if (input.manufacturer === "Lotus") {
    const packetReady = routes.every((route) => route?.manufacturer === "Lotus" && route.enterOrderMode === "document_packet");
    return {
      automaticEntry: false,
      documentPreparation: packetReady,
      reviewBoundary: "saved_draft_only",
      reason: packetReady ? "Lotus Enter Order prepares the exact product packet for review; email, cart, checkout, and submission remain manual." : "An exact Lotus product packet mapping is missing.",
    };
  }

  if (input.manufacturer === "Polar") {
    return {
      automaticEntry: false,
      documentPreparation: false,
      reviewBoundary: "saved_draft_only",
      reason: "QUOTE ONLY — Polar pricing, document preparation, portal entry, and manufacturer action are disabled.",
    };
  }

  return {
    automaticEntry: false,
    documentPreparation: false,
    reviewBoundary: "saved_draft_only",
    reason: "This manufacturer has no approved automatic portal adapter.",
  };
}
