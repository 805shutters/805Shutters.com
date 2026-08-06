// Helpers over the Norman dealer Portrait Honeycomb fabric availability data
// (src/lib/quote/norman-honeycomb-dealer-fabrics.generated.ts, captured from
// the logged-in dealer order form 2026-07-01). Used to mirror Norman's
// fabric-per-shade-size cascades in the CRM quote builder and to filter the
// fabric picker. See docs/norman-honeycomb-order-map.md.

import {
  normanHoneycombDealerFabricRows,
  type NormanHoneycombDealerFabricRow,
} from "@/lib/quote/norman-honeycomb-dealer-fabrics.generated";
import { canonicalizeHoneycombCellSize } from "./quoteConstants";

export type { NormanHoneycombDealerFabricRow };

const rowsByCellSize = new Map<string, NormanHoneycombDealerFabricRow[]>();
for (const row of normanHoneycombDealerFabricRows) {
  const rows = rowsByCellSize.get(row.cellSize);
  if (rows) rows.push(row);
  else rowsByCellSize.set(row.cellSize, [row]);
}

// The public picker catalog and the dealer form sometimes disagree on the
// trailing material suffix (e.g. dealer "F1527K" vs picker "F1527"), so
// availability is compared on the suffix-stripped code.
function normalizeColorCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase().replace(/[KTB]$/, "");
}

function isRoomDarkeningFabricType(fabricType: string): boolean {
  const value = fabricType.toLowerCase();
  return value.includes("room darkening") || value.includes("(rd)");
}

// Dealer fabric labels consistent with a builder light-control selection:
// Room Darkening / Blackout → the RD family; Light Filtering (and anything
// else) → the non-RD family. Unset → everything.
function fabricTypeMatchesLightControl(
  fabricType: string,
  lightControl: string | null | undefined
): boolean {
  if (!lightControl) return true;
  const normalized = lightControl.toLowerCase();
  if (normalized.includes("room darkening") || normalized.includes("blackout")) {
    return isRoomDarkeningFabricType(fabricType);
  }
  if (normalized.includes("light filtering")) {
    return !isRoomDarkeningFabricType(fabricType);
  }
  return true;
}

export function getHoneycombDealerRowsFor(
  cellSize: string | null | undefined
): readonly NormanHoneycombDealerFabricRow[] {
  const canonical = canonicalizeHoneycombCellSize(cellSize);
  if (!canonical) return [];
  return rowsByCellSize.get(canonical) ?? [];
}

/** Distinct dealer fabric labels offered for a shade size (Norman order). */
export function getHoneycombDealerFabricTypesFor(
  cellSize: string | null | undefined
): string[] {
  const rows = getHoneycombDealerRowsFor(cellSize);
  const source = rows.length ? rows : normanHoneycombDealerFabricRows;
  const seen = new Set<string>();
  const types: string[] = [];
  for (const row of source) {
    if (seen.has(row.fabricType)) continue;
    seen.add(row.fabricType);
    types.push(row.fabricType);
  }
  return types;
}

/**
 * Whether a color code is offered for a shade size on the dealer form
 * (optionally restricted to fabrics consistent with the selected light
 * control). Permissive when the dealer data has no entry for the size or the
 * row carries no color code.
 */
export function isHoneycombDealerColorAvailable(
  cellSize: string | null | undefined,
  colorCode: string | null | undefined,
  lightControl?: string | null
): boolean {
  const rows = getHoneycombDealerRowsFor(cellSize);
  if (!rows.length) return true;
  const code = normalizeColorCode(colorCode);
  if (!code) return true;
  return rows.some(
    (row) =>
      normalizeColorCode(row.colorCode) === code &&
      fabricTypeMatchesLightControl(row.fabricType, lightControl ?? null)
  );
}

/**
 * Whether a color carries Norman's 20% fabric surcharge (RD | Sheer | Solus |
 * FR Essentials family). Checks the dealer rows for the shade size first,
 * falling back to any size the color appears in.
 */
export function isHoneycombDealerColorSurcharged(
  cellSize: string | null | undefined,
  colorCode: string | null | undefined
): boolean {
  const code = normalizeColorCode(colorCode);
  if (!code) return false;
  const sized = getHoneycombDealerRowsFor(cellSize);
  const scoped = sized.filter((row) => normalizeColorCode(row.colorCode) === code);
  const matches = scoped.length
    ? scoped
    : normanHoneycombDealerFabricRows.filter(
        (row) => normalizeColorCode(row.colorCode) === code
      );
  return matches.some((row) => row.surcharged);
}
