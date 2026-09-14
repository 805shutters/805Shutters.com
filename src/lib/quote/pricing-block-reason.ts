/** Shared human-readable explanations for invalid legacy calculated prices. */
export function pricingBlockReasonMessage(reason: string): string {
  const messages: Record<string, string> = {
    missing_frame_sides: "Choose whether the shutter frame has 3 or 4 sides before pricing.",
    invalid_dimensions: "Enter a width and height greater than zero before pricing.",
    dimensions_outside_pricing_grid: "The measurements are outside the selected manufacturer's pricing grid.",
    unknown_fabric_price_group: "Choose a fabric that is mapped to the selected manufacturer's pricing grid.",
    manufacturer_product_mismatch: "The selected product belongs to a different manufacturer. Choose a matching product and program.",
    incomplete_polar_configuration: "Choose the Polar product, program, and fabric before pricing.",
    incomplete_lotus_configuration: "Choose a matching Lotus product and program before pricing.",
    incomplete_pricing_configuration: "Complete the manufacturer, product, and configuration before pricing.",
  };
  if (messages[reason]) return messages[reason];
  if (reason.startsWith("manufacturer_restriction:")) return "This configuration exceeds a manufacturer restriction. Review the size requirements shown above.";
  // Exact catalog failures are already customer-safe sentences.
  if (/\s/.test(reason)) return reason;
  return "Complete the manufacturer, product, and configuration before pricing.";
}
