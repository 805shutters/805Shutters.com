import {
  NORMAN_ROLLER_COLOR_CODE_DETAIL,
  NORMAN_ROLLER_COLOR_NAME_DETAIL,
  normanRollerFabricColors,
  normalizeNormanRollerFabricSearch,
  normanRollerFabricLabel,
  type NormanRollerFabricColor,
} from "@/lib/quote/norman-roller-fabrics";

export const ROLLER_FABRIC_COLOR_ID_DETAIL = "fabric_color_id";
export const ROLLER_FABRIC_COLOR_COLLECTION_DETAIL = "fabric_color_collection";
export const ROLLER_FABRIC_COLOR_TYPE_DETAIL = "fabric_color_type";
export const ROLLER_FABRIC_COLOR_CODE_DETAIL = NORMAN_ROLLER_COLOR_CODE_DETAIL;
export const ROLLER_FABRIC_COLOR_NAME_DETAIL = NORMAN_ROLLER_COLOR_NAME_DETAIL;

export type MtsRollerFabricColor = NormanRollerFabricColor & {
  id: string;
  label: string;
};

function fabricColorId(row: NormanRollerFabricColor): string {
  return `${row.collection}::${row.colorCode}`;
}

export const MTS_ROLLER_FABRIC_COLORS: readonly MtsRollerFabricColor[] =
  normanRollerFabricColors.map((row) => ({
    ...row,
    id: fabricColorId(row),
    label: normanRollerFabricLabel(row),
  }));

export function searchMtsRollerFabricColors(
  query: string,
  options: { includeUnavailable?: boolean; limit?: number } = {},
): MtsRollerFabricColor[] {
  const normalized = normalizeNormanRollerFabricSearch(query);
  const limit = options.limit ?? 40;
  const sourceRows = options.includeUnavailable
    ? MTS_ROLLER_FABRIC_COLORS
    : MTS_ROLLER_FABRIC_COLORS.filter((row) => row.available);

  if (!normalized) return sourceRows.slice(0, limit);

  const parts = normalized.split(" ").filter(Boolean);
  return sourceRows
    .filter((row) => parts.every((part) => row.searchText.includes(part)))
    .slice(0, limit);
}

export function findMtsRollerFabricColorById(
  id: string | null | undefined,
): MtsRollerFabricColor | undefined {
  if (!id) return undefined;
  return MTS_ROLLER_FABRIC_COLORS.find((row) => row.id === id && row.available);
}

export function findMtsRollerFabricColorBySelection(
  collection: string | null | undefined,
  colorCode: string | null | undefined,
  colorName?: string | null | undefined,
): MtsRollerFabricColor | undefined {
  if (!collection || !colorCode) return undefined;

  const normalizedCollection = collection.trim().toLowerCase();
  const normalizedCode = colorCode.trim().toLowerCase();
  const normalizedName = colorName?.trim().toLowerCase() ?? "";

  return MTS_ROLLER_FABRIC_COLORS.find((row) => {
    if (!row.available) return false;
    if (row.collection.toLowerCase() !== normalizedCollection) return false;
    if (row.colorCode.toLowerCase() !== normalizedCode) return false;
    if (normalizedName && row.colorName.toLowerCase() !== normalizedName) return false;
    return true;
  });
}

export function findMtsRollerFabricColorInText(text: string): MtsRollerFabricColor | undefined {
  const normalizedText = normalizeNormanRollerFabricSearch(text);
  if (!normalizedText) return undefined;

  return MTS_ROLLER_FABRIC_COLORS.find((row) => {
    if (!row.available) return false;
    return normalizedText.includes(normalizeNormanRollerFabricSearch(row.colorCode));
  }) ?? MTS_ROLLER_FABRIC_COLORS.find((row) => {
    if (!row.available) return false;
    return (
      normalizedText.includes(normalizeNormanRollerFabricSearch(row.collection)) &&
      normalizedText.includes(normalizeNormanRollerFabricSearch(row.colorName))
    );
  });
}

export function getMtsRollerFabricCollections(): readonly string[] {
  return [...new Set(MTS_ROLLER_FABRIC_COLORS.filter((row) => row.available).map((row) => row.collection))];
}

export function getMtsRollerFabricCollectionGroups(): Array<{
  label: string;
  fabrics: readonly string[];
}> {
  const groups = new Map<string, string[]>();

  for (const row of MTS_ROLLER_FABRIC_COLORS) {
    if (!row.available) continue;
    const rows = groups.get(row.fabricType) ?? [];
    if (!rows.includes(row.collection)) rows.push(row.collection);
    groups.set(row.fabricType, rows);
  }

  return [...groups.entries()].map(([label, fabrics]) => ({ label, fabrics }));
}

export function getMtsRollerProgramLabel(programId: string | null): string {
  if (!programId) return "Unpriced";
  if (programId.includes("solar_screen_price_group_1")) return "Solar PG1";
  if (programId.includes("solar_screen_price_group_2")) return "Solar PG2";
  if (programId.includes("solar_screen_price_group_3")) return "Solar PG3";
  if (programId.includes("fabric_price_group_1")) return "Fabric PG1";
  if (programId.includes("fabric_price_group_2")) return "Fabric PG2";
  if (programId.includes("fabric_price_group_3")) return "Fabric PG3";
  return programId;
}
