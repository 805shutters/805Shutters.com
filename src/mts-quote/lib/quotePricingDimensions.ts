import { formatDimensionsOrNull, formatMeasurement, type SalesQuoteDesign, type SalesQuoteLineItem } from "@mts/types/quote";
import { parseRomanAncillary, romanAncillaryUnitLabel, ROMAN_ANCILLARY_RECORD, ROMAN_PILLOWS, ROMAN_YARDAGE } from "@/lib/quote/norman-roman-ancillary";
import { parseReplacementRequest, replacementUnitLabel, SMARTDRAPE_REPLACEMENT, SMARTDRAPE_REPLACEMENT_RECORD } from "@/lib/quote/norman-smartdrape-replacement";

/** Accessories retain their source pricing units without inventing opening dimensions. */
export function formatQuoteDesignDimensions(item: SalesQuoteLineItem, design: SalesQuoteDesign): string | null {
  if (design.supplier?.trim().toLowerCase() !== "norman") return formatDimensionsOrNull(item);
  const options = design.options_json ?? {};
  const productId = String(options.catalog_product_id ?? options.quote_lab_product_id ?? "");
  if (productId === SMARTDRAPE_REPLACEMENT) {
    const record = parseReplacementRequest(options[SMARTDRAPE_REPLACEMENT_RECORD]);
    return record && ((record.shadeLengthInches ?? 0) > 0 || (record.vaneLengthInches ?? 0) > 0)
      ? replacementUnitLabel(record) : null;
  }
  if (productId === ROMAN_YARDAGE || productId === ROMAN_PILLOWS) {
    const record = parseRomanAncillary(options[ROMAN_ANCILLARY_RECORD]);
    const selected = productId === ROMAN_YARDAGE
      ? record?.kind === "yardage" && record.yards !== null && record.yards > 0
      : record?.kind === "pillow_cover" && Boolean(record.size);
    return selected ? romanAncillaryUnitLabel(productId, record) : null;
  }
  if (productId === "palladian_shelf") {
    return Number.isFinite(item.width_whole) && item.width_whole > 0
      ? `${formatMeasurement(item.width_whole, item.width_fraction)} wide`
      : null;
  }
  return formatDimensionsOrNull(item);
}
