export type ManufacturerPortalCapabilityInput = {
  manufacturer: string;
  routingKeys: string[];
  sourceKind?: string | null;
};

export type ManufacturerPortalCapability = {
  automaticEntry: boolean;
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
      reviewBoundary: "saved_draft_only",
      reason: "Exact product routing is missing, so automatic portal entry is blocked.",
    };
  }

  if (input.manufacturer === "Norman") {
    const submittedMeasure = input.sourceKind === "submitted_technical_measure";
    const rollerOnly = routingKeys.every((routingKey) => routingKey === "norman:roller");
    return submittedMeasure && rollerOnly
      ? {
          automaticEntry: true,
          reviewBoundary: "saved_draft_only",
          reason: "Verified Norman Roller adapter; stops at the saved-draft review screen.",
        }
      : {
          automaticEntry: false,
          reviewBoundary: "saved_draft_only",
          reason: "Automatic Norman entry is verified only for submitted Soluna Roller technical measures.",
        };
  }

  if (input.manufacturer === "Onyx") {
    const onyxOnly = routingKeys.every((routingKey) => routingKey.startsWith("onyx:"));
    return onyxOnly
      ? {
          automaticEntry: true,
          reviewBoundary: "saved_draft_only",
          reason: "Verified Onyx shutter adapter; exact material and conditional fields are rechecked before entry.",
        }
      : {
          automaticEntry: false,
          reviewBoundary: "saved_draft_only",
          reason: "The task contains a non-Onyx route, so automatic Onyx entry is blocked.",
        };
  }

  if (input.manufacturer === "Lotus") {
    return {
      automaticEntry: false,
      reviewBoundary: "saved_draft_only",
      reason: "Lotus custom products use manufacturer order documents/email; no authenticated custom-order portal adapter is verified.",
    };
  }

  if (input.manufacturer === "Polar") {
    return {
      automaticEntry: false,
      reviewBoundary: "saved_draft_only",
      reason: "Polar PIC authentication and product-screen selectors must be verified before automatic entry.",
    };
  }

  return {
    automaticEntry: false,
    reviewBoundary: "saved_draft_only",
    reason: "This manufacturer has no approved automatic portal adapter.",
  };
}
