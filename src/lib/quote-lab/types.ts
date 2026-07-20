import type { MotorizationSelection, PriceInput, PriceResult, SurchargeSelection } from "@/lib/quote/pricing";

export type QuoteLabDesignInput = Omit<PriceInput, "quantity"> & {
  id: string;
  label: string;
  /** Simulates a browser-local shutter rate override in the active MTS builder. */
  legacyRetailOverride?: number;
  /** Simulates the stale stored price retained when the active builder cannot reprice. */
  legacyStoredUnitPrice?: number;
  surcharges?: SurchargeSelection[];
  motorization?: MotorizationSelection[];
};

export type QuoteLabLineInput = {
  id: string;
  room: string;
  quantity: number;
  selectedDesignId: string | null;
  designs: QuoteLabDesignInput[];
};

export type QuoteLabQuoteInput = {
  id: string;
  name: string;
  lines: QuoteLabLineInput[];
};

export type QuoteLabFixture = {
  id: string;
  name: string;
  description: string;
  quote: QuoteLabQuoteInput;
};

export type LegacyPriceStatus = "ok" | "unsupported" | "unpriceable" | "stale_retained";

export type LegacyPriceResult = {
  status: LegacyPriceStatus;
  unitPrice: number | null;
  total: number;
  pricingMethod: string;
  explanation: string;
  warnings: string[];
};

export type QuoteLabDesignComparison = {
  designId: string;
  label: string;
  selected: boolean;
  authoritative: PriceResult;
  legacy: LegacyPriceResult;
};

export type QuoteLabLineComparison = {
  lineId: string;
  room: string;
  quantity: number;
  selectedDesignId: string | null;
  designs: QuoteLabDesignComparison[];
  authoritativeTotal: number;
  legacyTotal: number;
  sendBlocked: boolean;
  blockReason: string | null;
};

export type QuoteLabOrderCharge = {
  id: string;
  label: string;
  amount: number;
  detail: string;
};

export type QuoteLabComparison = {
  quoteId: string;
  quoteName: string;
  authoritativeTotal: number;
  legacyTotal: number;
  difference: number;
  sendBlocked: boolean;
  findings: string[];
  orderCharges: QuoteLabOrderCharge[];
  orderChargeTotal: number;
  lines: QuoteLabLineComparison[];
  isolation: {
    database: "none";
    productionWrites: false;
    email: false;
    sms: false;
    payments: false;
    manufacturerOrders: false;
    persistence: "browser-session-only";
  };
};

export type QuoteLabCatalogProduct = {
  id: string;
  name: string;
  productType: string;
  provisional: boolean;
  source: string | null;
  programs: Array<{ id: string; name: string; priceAxis: "wh" | "width" | "sqft" }>;
  surcharges: Array<{
    id: string;
    name: string;
    kind: "percent" | "flat";
    per: "unit" | "side" | "foot" | "sqft" | "once";
    value: number | null;
    widthGraduated: boolean;
  }>;
  motorizationGroups: Array<{
    groupId: string;
    name: string;
    options: Array<{ id: string; name: string; price: number | null }>;
  }>;
};

export type QuoteLabCatalogResponse = {
  source: string;
  effectiveDate: string;
  products: QuoteLabCatalogProduct[];
  fixtures: QuoteLabFixture[];
  isolation: QuoteLabComparison["isolation"];
};
