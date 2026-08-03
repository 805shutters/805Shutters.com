export const POLAR_QUOTE_ONLY_STATUS = "QUOTE_ONLY" as const;

export function isPolarManufacturer(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "polar";
}

export function isPolarProductId(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase().startsWith("polar_") === true;
}

export function polarQuoteOnlyOptions(productId: string): Record<string, string> {
  return {
    quote_only_status: POLAR_QUOTE_ONLY_STATUS,
    quote_only_reason: "polar_pricing_and_follow_on_automation_disabled",
    quote_only_manufacturer: "Polar",
    quote_only_product_id: productId,
    quote_only_internal_task: "Staff must obtain and review a manual Polar quote.",
    quote_only_blocks:
      "pricing, customer_send, status_advance, order_preparation, manufacturer_action",
  };
}
