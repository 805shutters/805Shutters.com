/** Narrow September corrections; retained generated identities are historical evidence. */
export const NORMAN_MICRO_SLAT_SURCHARGE_ID = "micro_1_2in_slats";

export const NORMAN_ASSORTMENT_WITHDRAWALS = [
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
