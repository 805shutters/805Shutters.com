import { isNormanValanceOnly } from "./norman-valance-only";
import { ROMAN_PILLOWS, ROMAN_YARDAGE } from './norman-roman-ancillary';
import { SMARTDRAPE_REPLACEMENT } from './norman-smartdrape-replacement';
import { lotusVerticalMeasurementAxis } from './lotus-vertical';
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from '../quote-v2/selected-design';

type Options = Record<string, unknown> | null | undefined;
/** Quantity counts cuts/packs, not the yardage/vane count inside each one. */
export function quoteQuantityUnit(options: Options): string {
  const id = options?.catalog_product_id ?? options?.quote_lab_product_id;
  if (typeof id === 'string' && isNormanValanceOnly(id)) return 'valance';
  if (id === SMARTDRAPE_REPLACEMENT) return 'pack';
  if (id === ROMAN_YARDAGE) return 'fabric cut';
  if (id === ROMAN_PILLOWS) return 'pillow cover';
  const axis = lotusVerticalMeasurementAxis(options);
  if (axis === 'width') return 'headrail';
  if (axis === 'height') return 'vane';
  if (id === 'lotus_dealer_listed_parts') return 'item';
  return 'window';
}
export function quoteQuantityLabel(quantity: number, options: Options): string {
  return `${quantity} ${quoteQuantityUnit(options)}${quantity === 1 ? '' : 's'}`;
}
export function incompleteQuantityLabel(
  lines: { id: string; quantity?: number | null }[],
  designs: { line_item_id?: string | null; variant?: string | null; options_json?: Options; [QUOTE_V2_SELECTED_DESIGN_MARKER]?: boolean }[],
  incompleteIds: string[],
): string {
  const totals = new Map<string, number>();
  for (const line of lines.filter(line => incompleteIds.includes(line.id))) {
    const rows = designs.filter(row => row.line_item_id === line.id);
    const selected = rows.find(row => row[QUOTE_V2_SELECTED_DESIGN_MARKER]) ?? rows.find(row => row.variant === 'A') ?? rows[0];
    const unit = quoteQuantityUnit(selected?.options_json);
    const quantity = Number(line.quantity);
    totals.set(unit, (totals.get(unit) ?? 0) + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1));
  }
  const total = [...totals.values()].reduce((sum, count) => sum + count, 0);
  return [...totals].map(([unit, count]) => `${count} ${unit}${count === 1 ? '' : 's'}`).join(' and ') + `${total === 1 ? ' needs' : ' need'} pricing`;
}
