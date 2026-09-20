/**
 * Normalized, customer-neutral evidence from the authenticated 805 Lotus
 * dealer account. Portal observations are corroborating evidence only: Lotus'
 * terms say prices may change at any time, and the portal does not publish a
 * price-book effective date.
 */
export const LOTUS_FLX_PORTAL_AUDIT = {
  productId: "lotus_faux_wood_blinds",
  programId: "lotus_flx_2in_bright_white_custom",
  observedAt: "2026-07-26T18:09:24.619Z",
  accountScope: "Authenticated current 805 Lotus dealer account",
  portalUrl: "https://www.lotusblind.com/",
  termsUrl: "https://www.lotusblind.com/pages/terms-and-conditions",
  guideSourceId: "lotus-west-a26-v1",
  guidePage: 99,
  guideProductPage: 29,
  orderingGuideUrl:
    "https://cdn.shopify.com/s/files/1/0723/5085/9514/files/orderguide_form.pdf?v=1749232248",
  orderingGuideMeasurementPage: 112,
  rows: [
    {
      sku: "CFLX7296BW",
      guideWidth: 72,
      guideHeight: 96,
      guideDealerNet: 98.4,
      portalPrice: 105,
      portalWidthRange: "69.25-72",
      portalLengthRange: "86-96",
      metadataMatchesSku: true,
    },
    {
      sku: "CFLX3096BW",
      guideWidth: 30,
      guideHeight: 96,
      guideDealerNet: 50.26,
      portalPrice: 105,
      portalWidthRange: "27.25-30",
      portalLengthRange: "74-84",
      metadataMatchesSku: false,
    },
    {
      sku: "CFLX5960BW",
      guideWidth: 59,
      guideHeight: 60,
      guideDealerNet: 53.81,
      portalPrice: 105,
      portalWidthRange: "54.25-59",
      portalLengthRange: "50-60",
      metadataMatchesSku: true,
    },
    {
      sku: "CFLX9572BW",
      guideWidth: 95,
      guideHeight: 72,
      guideDealerNet: 180.02,
      portalPrice: 105,
      portalWidthRange: "89-95",
      portalLengthRange: "62-72",
      metadataMatchesSku: true,
    },
    {
      sku: "CFLX2796BW",
      guideWidth: 27,
      guideHeight: 96,
      guideDealerNet: 41.28,
      portalPrice: 105,
      portalWidthRange: "23.25-27",
      portalLengthRange: "86-96",
      metadataMatchesSku: true,
    },
    {
      sku: "CFLX3036BW",
      guideWidth: 30,
      guideHeight: 36,
      guideDealerNet: 32.99,
      portalPrice: 105,
      portalWidthRange: "27.25-30",
      portalLengthRange: "26-36",
      metadataMatchesSku: true,
    },
    {
      sku: "CFLX5948BW",
      guideWidth: 59,
      guideHeight: 48,
      guideDealerNet: 49.53,
      portalPrice: 105,
      portalWidthRange: "54.25-59",
      portalLengthRange: "38-48",
      metadataMatchesSku: true,
    },
    {
      sku: "CFLX4860BW",
      guideWidth: 48,
      guideHeight: 60,
      guideDealerNet: 45.09,
      portalPrice: 105,
      portalWidthRange: "43.25-48",
      portalLengthRange: "74-84",
      metadataMatchesSku: false,
    },
    {
      sku: "CFLX9560BW",
      guideWidth: 95,
      guideHeight: 60,
      guideDealerNet: 151.35,
      portalPrice: 105,
      portalWidthRange: "89-95",
      portalLengthRange: "50-60",
      metadataMatchesSku: true,
    },
  ],
} as const;

/** Exact custom SKUs entered with their stated dimensions and read back in the
 * authenticated dealer cart. These are observations, not a replacement rate
 * schedule: discounts, shipping and taxes are still deferred to checkout.
 */
export const LOTUS_CUSTOM_CART_AUDIT_20260920 = {
  observedDate: "2026-09-20",
  accountScope: "Authenticated current 805 Lotus dealer account",
  portalUrl: "https://www.lotusblind.com/cart",
  guideSourceId: "lotus-west-a26-v1",
  effectiveDate: null,
  rows: [
    { productId: "lotus_faux_wood_blinds", programId: "lotus_flxe_2in_embossed_bright_white_custom", programCode: "FLXE", sku: "CFLX2736EBW", width: 27, height: 36, guideDealerNet: 30.39, portalCartUnitPrice: 105, guidePage: 100 },
    { productId: "lotus_faux_wood_blinds", programId: "lotus_fgx_2_5in_bright_white_custom", programCode: "FGX", sku: "CFGX5960BW", width: 59, height: 60, guideDealerNet: 62.63, portalCartUnitPrice: 105, guidePage: 104 },
    { productId: "lotus_vinyl_blinds", programId: "lotus_rlx_1in_vinyl_plus_custom", programCode: "RLX", sku: "CRLX7296W", width: 72, height: 96, guideDealerNet: 56.26, portalCartUnitPrice: 105, guidePage: 96 },
    { productId: "lotus_vinyl_blinds", programId: "lotus_rtx_2in_vinyl_plus_custom", programCode: "RTX", sku: "CRTX4872W", width: 48, height: 72, guideDealerNet: 38.34, portalCartUnitPrice: 105, guidePage: 98 },
  ],
} as const;

export type WholesaleAuthorityFinding = Readonly<{
  code:
    | "SOURCE_PRICE_CONFLICT"
    | "PORTAL_METADATA_CONFLICT"
    | "EFFECTIVE_DATE_MISSING";
  blocking: true;
  summary: string;
  detail: string;
  evidence: readonly string[];
}>;

const LOTUS_FLX_AUTHORITY_FINDINGS: readonly WholesaleAuthorityFinding[] = [
  {
    code: "SOURCE_PRICE_CONFLICT",
    blocking: true,
    summary: "Dealer guide and current portal prices conflict",
    detail:
      "Nine exact FLX Bright White SKUs show $105 each in the authenticated 805 portal, while their pinned West A26.v1 page 99 cells range from $32.99 to $180.02. Neither source states a controlling current effective date.",
    evidence: [
      "lotus-west-a26-v1 pages 29 and 99",
      `Authenticated portal observation ${LOTUS_FLX_PORTAL_AUDIT.observedAt}`,
      "Lotus terms: availability and prices may change at any time",
    ],
  },
  {
    code: "PORTAL_METADATA_CONFLICT",
    blocking: true,
    summary: "Two portal SKU descriptions conflict with their size codes",
    detail:
      "CFLX3096BW and CFLX4860BW are 96-inch and 60-inch guide cells, but both portal rows advertise a 74–84-inch length range.",
    evidence: [
      "CFLX3096BW portal row",
      "CFLX4860BW portal row",
      "lotus-west-a26-v1 page 99",
    ],
  },
  {
    code: "EFFECTIVE_DATE_MISSING",
    blocking: true,
    summary: "Current pricing effective date is not published",
    detail:
      "West A26.v1 and the authenticated product rows do not state the date on which either price set controls the current 805 dealer account.",
    evidence: [
      "lotus-west-a26-v1 manifest",
      `Authenticated portal observation ${LOTUS_FLX_PORTAL_AUDIT.observedAt}`,
    ],
  },
];

export function wholesaleAuthorityFindings(
  productId: string,
  programId: string,
): readonly WholesaleAuthorityFinding[] {
  if (productId === LOTUS_FLX_PORTAL_AUDIT.productId &&
      programId === LOTUS_FLX_PORTAL_AUDIT.programId) return LOTUS_FLX_AUTHORITY_FINDINGS;
  const row = LOTUS_CUSTOM_CART_AUDIT_20260920.rows.find(
    (item) => item.productId === productId && item.programId === programId,
  );
  if (!row) return [];
  return [{
    code: "SOURCE_PRICE_CONFLICT",
    blocking: true,
    summary: "Dealer guide and current authenticated cart prices conflict",
    detail: `${row.sku} at ${row.width} × ${row.height} inches shows $${row.portalCartUnitPrice.toFixed(2)} in the authenticated cart, versus $${row.guideDealerNet.toFixed(2)} in West A26.v1. Preserve the source grid pending confirmation of the controlling rate schedule.`,
    evidence: [`lotus-west-a26-v1 page ${row.guidePage}`, `Authenticated dealer cart observation ${LOTUS_CUSTOM_CART_AUDIT_20260920.observedDate}: ${row.sku}`],
  }, {
    code: "EFFECTIVE_DATE_MISSING",
    blocking: true,
    summary: "Current pricing effective date is not published",
    detail: "The current linked assortment catalog and ordering guide do not resolve the conflicting custom dealer rates or identify a controlling effective date.",
    evidence: ["Lotus FAQs Digital Catalog V1.1.25", "Lotus FAQs orderguide_form.pdf", "Authenticated dealer cart 2026-09-20"],
  }];
}

/** Block only programs with recorded source conflicts; preserve their guide grids. */
export function lotusCustomerDeliveryBlock(
  productId: string, programId: string, mountType?: unknown,
): string | null {
  if (!productId.startsWith("lotus_")) return null;
  if (wholesaleAuthorityFindings(productId, programId).length) {
    const code = LOTUS_CUSTOM_CART_AUDIT_20260920.rows.find(
      (row) => row.productId === productId && row.programId === programId,
    )?.programCode ?? "FLX";
    return `Lotus ${code} dealer-guide and portal prices conflict. Customer delivery requires source authority confirmation.`;
  }
  // July 22 authenticated three-product cart: CFCX4872W was $105 in the
  // portal versus $53.97 in West A26.v1 (fresh-portal-order-recipes.json).
  if (programId === "lotus_fcx_2in_soft_white_custom") {
    return "Lotus FCX dealer-guide and portal prices conflict. Customer delivery requires source authority confirmation.";
  }
  if (typeof mountType === "string" && /\bside\s*mount\b/i.test(mountType)) {
    return "Lotus Side Mount fitment and ordering dimensions require manufacturer confirmation.";
  }
  if (programId === "lotus_cvv_vertical_vanes_custom") {
    return "Lotus vertical vane pricing does not establish whether the grid amount is per vane or per casepack.";
  }
  return null;
}

export function summarizeLotusFlxPortalAudit() {
  const rows = LOTUS_FLX_PORTAL_AUDIT.rows;
  const priceConflicts = rows.filter(
    (row) => Number(row.portalPrice) !== Number(row.guideDealerNet),
  );
  const metadataConflicts = rows.filter((row) => !row.metadataMatchesSku);
  return {
    rowCount: rows.length,
    priceConflictCount: priceConflicts.length,
    metadataConflictSkus: metadataConflicts.map((row) => row.sku),
    guideDealerNetMin: Math.min(...rows.map((row) => row.guideDealerNet)),
    guideDealerNetMax: Math.max(...rows.map((row) => row.guideDealerNet)),
    portalUnitPrice: rows.every(
      (row) => row.portalPrice === rows[0].portalPrice,
    )
      ? rows[0].portalPrice
      : null,
    customerPriceEligible: false as const,
  };
}
