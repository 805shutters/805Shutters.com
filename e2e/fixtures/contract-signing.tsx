import React from "react";
import { createRoot } from "react-dom/client";
import { CustomerContractDocument } from "../../src/app/quote/[token]/CustomerContractDocument";
import type { PublicQuote } from "../../src/lib/crm/public-quote";
export const signingFixture = {
  token: "synthetic-signing", id: "fixture", quoteNumber: "LOCAL-TEST", customerName: "Synthetic Customer", customerAddress: "123 Example Lane",
  customerPhone: null, customerEmail: null, status: "sent", signed: false, signedAt: null,
  lines: ["Kitchen", "Living room"].map((room, index) => ({ id: `line-${index + 1}`, lineItemId: `line-${index + 1}`, room,
    productName: "Roller Shades", styleName: "", options: ["Lift System: Cordless"], designOptions: [], showDesignOptions: false,
    quantity: 1, unitPrice: 450, lineTotal: 450, discountPercent: 0, priceReady: true })),
  subtotal: 900, fees: [], discount: 0, tax: 0, sourceTotalAdjustment: 0, total: 900, depositDue: 450, balanceDue: 450,
  payment: { available: true, dueType: "deposit", amountDue: 450, outstanding: 900, depositPaid: 0, paidTotal: 0 },
  allPriced: true, hasOnyxShutters: false, adjustments: { discountFlat: 0, discountPercent: 0, taxPercent: 0, depositPercent: 50, fees: [], totalOverride: null, balanceDueOverride: null, balanceAdjustmentNote: "" },
  business: { name: "805 Shutters", phone: "805-806-9344", website: "https://www.805shutters.com", email: "805@805shutters.com" }, versions: [],
} satisfies PublicQuote;
document.body.style.cssText = "margin:0;font-family:Arial,sans-serif;background:#fff;color:#111";
createRoot(document.getElementById("root")!).render(<><style>{"*,*::before,*::after{box-sizing:border-box}"}</style><CustomerContractDocument quote={signingFixture} paymentOptions={{zelleDestination:"805-555-0100"}} /></>);
