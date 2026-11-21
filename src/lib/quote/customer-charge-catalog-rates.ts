/**
 * Install and shipping used by the existing catalog price path.
 * Live lookup does not read these. It reads crm_quote_charge_settings.
 * The catalog path keeps these amounts so a vendor switch that is off
 * still prices the way it does today.
 */
export const CATALOG_CUSTOMER_CHARGE_RATES = Object.freeze({
  installationPerUnit: 25,
  shippingPerUnit: 14,
});
