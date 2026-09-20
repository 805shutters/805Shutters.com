import type { NormanRomanDealerFabricRow } from './norman-roman-dealer-fabrics.generated';
/** September guide p25 and current dealer comparison with PG2 F0031.
 * Keep the July imported rows intact for historical quotes. */
export function romanPriceGroup(row: NormanRomanDealerFabricRow, asOf = '2026-09-19'): string {
 return asOf >= '2026-09-19' && ((row.collection === 'Sheer Elegance' && row.colorCode === 'F1085') || (row.collection === 'Valencia' && row.colorCode === 'F0255')) ? 'group2' : row.priceGroup;
}
