/** Narrow September corrections; retained generated identities are historical evidence. */
export const NORMAN_MICRO_SLAT_SURCHARGE_ID = "micro_1_2in_slats";

export const NORMAN_ASSORTMENT_WITHDRAWALS = [
  {
    productId: "roman",
    colorCode: "F1052",
    effectiveFrom: "2026-01-01",
    sourceId: "norman-roman-guide-2026-09",
    page: 2,
    explanation: "Norman discontinued Libeco Belgian Linen Silver 8045 (AA0901) / F1052 effective 2026-01-01 (Roman Guide revision table, page 2). Select a current fabric.",
  },
  {
    productId: "roman",
    colorCode: "F1054",
    effectiveFrom: "2026-02-01",
    sourceId: "norman-roman-guide-2026-09",
    page: 2,
    explanation: "Norman discontinued Libeco Belgian Linen Oyster 0021 (AA0902) / F1054 effective 2026-02-01 (Roman Guide revision table, page 2). Select a current fabric.",
  },
  {
    productId: "roman",
    colorCode: "F0237",
    effectiveFrom: "2026-02-01",
    sourceId: "norman-roman-guide-2026-09",
    page: 2,
    explanation: "Norman discontinued Seabreeze Silver Sage (AA0307) / F0237 effective 2026-02-01 (Roman Guide revision table, page 2). Select a current fabric.",
  },
  {
    productId: "roman",
    colorCode: "F1050",
    effectiveFrom: "2026-04-10",
    sourceId: "norman-roman-guide-2026-09",
    page: 2,
    explanation: "Norman discontinued Libeco Belgian Linen Pewter 8027 (AA0901) / F1050 effective 2026-04-10 (Roman Guide revision table, page 2). Select a current fabric.",
  },
  {
    productId: "roman",
    colorCode: "F1055",
    effectiveFrom: "2026-04-10",
    sourceId: "norman-roman-guide-2026-09",
    page: 2,
    explanation: "Norman discontinued Libeco Belgian Linen Flax 0024 (AA0902) / F1055 effective 2026-04-10 (Roman Guide revision table, page 2). Select a current fabric.",
  },
  {
    productId: "roman",
    colorCode: "F1068",
    effectiveFrom: "2026-05-11",
    sourceId: "norman-roman-guide-2026-09",
    page: 2,
    explanation: "Norman discontinued Solids Graphite Gray (AA0320) / F1068 effective 2026-05-11 (Roman Guide revision table, page 2). Select a current fabric.",
  },
  {
    productId: "roller",
    colorCode: "F1561",
    effectiveFrom: "2026-09-01",
    sourceId: "norman-roller-guide-2026-09-16",
    page: 2,
    explanation: "Norman discontinued Emery Maize F1561 effective September 1, 2026 (September 16 guide revision, pages 2 and 77). Select a current fabric.",
  },
  {
    productId: "roman",
    colorCode: "F0210",
    effectiveFrom: "2026-09-01",
    sourceId: "norman-roman-guide-2026-09",
    page: 2,
    explanation: "Norman discontinued Taylor Corn Silk White (AA0305 / F0210) effective September 1, 2026. Select a current fabric.",
  },
  {
    productId: "perfectsheer",
    colorCode: "F1364",
    effectiveFrom: "2026-08-11",
    sourceId: "norman-perfectsheer-smartdrape-guide-2026-09",
    page: 2,
    explanation: "Norman removed PerfectSheer Light Filtering Silver F1364 effective August 11, 2026. Select a current fabric.",
  },
] as const;

export function normanColorWithdrawal(productId: string, colorCode: unknown, asOf = "2026-09-01") {
  const code = typeof colorCode === "string" ? colorCode.trim().toUpperCase() : "";
  return NORMAN_ASSORTMENT_WITHDRAWALS.find((entry) =>
    entry.productId === productId && entry.colorCode === code && asOf >= entry.effectiveFrom,
  );
}

export function isNormanMicroSlatSize(value: unknown): boolean {
  return typeof value === "string" && value.trim().replace(/[^0-9]+/g, " ").trim() === "1 2";
}
