export const POLAR_QUOTE_ONLY_STATUS = "QUOTE_ONLY" as const;

export function isPolarManufacturer(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "polar";
}

export function isPolarProductId(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase().startsWith("polar_");
}

export function isPolarQuoteOnlyProductId(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "polar_tension_shade";
}

export function polarQuoteOnlyOptions(productId: string) {
  return {
    quote_only_status: POLAR_QUOTE_ONLY_STATUS,
    quote_only_reason: "polar_pricing_and_follow_on_automation_disabled",
    quote_only_manufacturer: "Polar",
    quote_only_product_id: productId,
    quote_only_internal_task: "Staff must obtain and review a manual Polar quote.",
    quote_only_blocks: [
      "pricing",
      "customer_send",
      "status_advance",
      "order_preparation",
      "manufacturer_action",
    ],
  } as const;
}
