import type { PublicQuote } from "./public-quote";
import { DEFAULT_ADJUSTMENTS } from "./quote-builder";
import { unavailableQuotePaymentState } from "./quote-payment-state";

/** Synthetic only. Raw historic labels deliberately exercise presentation guards. */
export function manufacturerBrandingFixture(signed = false): PublicQuote {
  const products = [
    { room: "Living Room", productName: "Norman Soluna Roller Shades", styleName: "F1244 - Polar White", options: ["Manufacturer: Norman", "Lift System: SmartRise Cordless", "Mount Type: Inside Mount", "Fabric: F1244 - Polar White"], price: 402.9 },
    { room: "Kitchen", productName: "Onyx Shutters", styleName: "Painted Basswood", options: ["Supplier: Onyx", "Material: Painted Basswood", 'Louver Size: 3 1/2"', "Color: Pure White"], price: 527 },
    { room: "Office", productName: "Lotus Faux Wood Blinds", styleName: "White", options: ["MFR: Lotus", "Control: Cordless"], price: 100 },
    { room: "Patio", productName: "Polar Interior Roller", styleName: "Solar Screen", options: ["Brand: Polar", "Motor: Somfy Rechargeable", "Light Control: Light Filtering"], price: 650 },
  ];
  return {
    id: "synthetic-branding-qa", token: "synthetic-branding-qa", quoteNumber: "QA-ONLY",
    customerName: "Sample Customer", customerAddress: "Sample project", customerEmail: "sample@example.invalid", customerPhone: null,
    status: signed ? "sold" : "sent", signed, signedAt: signed ? "2026-09-02T12:00:00Z" : null,
    lines: products.map((product, index) => ({
      id: `line-${index}`, lineItemId: `line-${index}`, room: product.room,
      productName: product.productName, styleName: product.styleName, options: product.options,
      designOptions: [{ id: `design-${index}`, label: "A", productName: product.productName, styleName: product.styleName, options: product.options, unitPrice: product.price, lineTotal: product.price, priceReady: true }],
      showDesignOptions: true, unitPrice: product.price, quantity: 1, lineTotal: product.price,
      discountPercent: 0, priceReady: true,
    })),
    subtotal: 1679.9, fees: [], discount: 0, tax: 0, sourceTotalAdjustment: 0,
    total: 1679.9, depositDue: 839.95, balanceDue: 839.95, allPriced: true,
    hasOnyxShutters: true, adjustments: DEFAULT_ADJUSTMENTS, payment: unavailableQuotePaymentState(),
    business: { name: "805 Shutters", phone: "805-806-9344", website: "805shutters.com", email: "805@805shutters.com" },
    versions: [],
  };
}
