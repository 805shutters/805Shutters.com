export type LiveLookupQuoteSummary = {
  margin: number | null;
  setBy: string | null;
  setAt: string | null;
};

export type LiveLookupLineSummary = {
  lineId: string;
  netUnitPrice: number | null;
  installation: number | null;
  shipping: number | null;
  priceSource: "live_site" | "manual_no_source" | null;
  manualTypedBy: string | null;
};

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function liveLookupQuoteText(quote: LiveLookupQuoteSummary): string {
  if (quote.margin == null) return "Live margin is not set. Pricing from a site net is blocked until Mike or Jessica sets one.";
  const who = quote.setBy ? ` set by ${quote.setBy}` : "";
  const when = quote.setAt ? ` on ${quote.setAt}` : "";
  return `Live margin ${quote.margin}${who}${when}.`;
}

export function liveLookupLineText(line: LiveLookupLineSummary): string {
  const manual = line.priceSource === "manual_no_source"
    ? `manual${line.manualTypedBy ? ` by ${line.manualTypedBy}` : ""}`
    : null;
  const parts = [
    line.netUnitPrice == null ? null : `Net ${money(line.netUnitPrice)}`,
    line.installation == null ? null : `Install ${money(line.installation)}`,
    line.shipping == null ? null : `Shipping ${money(line.shipping)}`,
    manual,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

export type QuoteChargeSettingView = { key: string; amount: number; appliesTo: string; updatedBy: string };

export function quoteChargeSettingText(settings: readonly QuoteChargeSettingView[]): string {
  const install = settings.find((row) => row.key === "install_per_unit");
  const ship = settings.find((row) => row.key === "ship_per_unit");
  if (!install || !ship) return "Install and shipping settings are not available.";
  return `Install ${money(install.amount)} per unit and shipping ${money(ship.amount)} per unit for ${install.appliesTo}. Updated by ${install.updatedBy}.`;
}
