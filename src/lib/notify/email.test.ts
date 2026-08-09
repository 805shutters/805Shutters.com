import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildPaymentLinkEmail, buildQuoteEmail, buildSignedQuoteShopEmail, buildSquareOrderPaymentEmail, isResendConfigured, sendEmail } from "./email";

describe("buildSquareOrderPaymentEmail", () => {
  it("uses deposit-specific order-start language and the Square link", () => {
    const mail = buildSquareOrderPaymentEmail("Jane Smith", "https://square.link/deposit", {
      paymentType: "deposit",
      amount: 1_250,
      quoteNumber: "805-0123",
    });
    expect(mail.subject).toContain("deposit link");
    expect(mail.text).toContain("start your order");
    expect(mail.text).toContain("$1,250.00");
    expect(mail.html).toContain("https://square.link/deposit");
  });

  it("thanks the customer and requests the remaining balance", () => {
    const mail = buildSquareOrderPaymentEmail("Jane Smith", "https://square.link/balance", {
      paymentType: "balance",
      amount: 2_750,
    });
    expect(mail.subject).toContain("balance link");
    expect(mail.text).toContain("Thank you so much for your order");
    expect(mail.text).toContain("remaining balance");
  });
});

describe("buildQuoteEmail", () => {
  it("includes the amount, link, and customer name", () => {
    const { subject, html, text } = buildQuoteEmail("Jane Smith", "https://x/quote/abc", 4250);
    expect(subject).toContain("$4,250");
    expect(subject).toContain("contract");
    expect(html).toContain("https://x/quote/abc");
    expect(text).toContain("Jane Smith");
    expect(text).toContain("Your contract from 805 Shutters");
    expect(html).toContain("Jane Smith");
    expect(text).toContain("Official 805 Shutters contact: 805Shutters.com | 805-806-9344");
    expect(html).toContain("805@805shutters.com");
  });
  it("falls back to a generic greeting and omits amount when zero", () => {
    const { subject, text } = buildQuoteEmail("Valued customer", "https://x/quote/abc", 0);
    expect(text).toContain("there");
    expect(subject).not.toContain("$");
  });
  it("escapes HTML in the customer name", () => {
    const { html } = buildQuoteEmail("<script>", "https://x", 10);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("renders the supplied black logo directly on the white email background", () => {
    const { html } = buildQuoteEmail("Jane Smith", "https://x/quote/abc", 4250, {
      logoUrl: "https://www.805shutters.com/brand/805-shutters-logo-header.png",
    });

    expect(html).toContain("805-shutters-logo-header.png");
    expect(html).not.toContain("805-shutters-logo-header-white.png");
    expect(html).not.toContain("background:#1f1f1f");
    expect(html).toContain('bgcolor="#ffffff"');
    expect(html).toContain("background:#ffffff");
    expect(html).toContain("color:#0b0b0b");
  });
  it("renders clean text line items without product images", () => {
    const { html, text } = buildQuoteEmail("Jane Smith", "https://x/quote/abc", 4250, {
      quoteNumber: "Q-100",
      lines: [
        {
          room: "Living Room",
          productName: "Honeycomb Shades",
          styleName: "Cordless",
          options: [
            "Mount Type: Inside mount",
            "Catalog Product Id: honeycomb",
            "Catalog Manufacturer: Norman",
            "Quote Lab Product Id: honeycomb",
          ],
          quantity: 2,
          lineTotal: 4250,
        },
      ],
      subtotal: 4250,
      depositDue: 2125,
      balanceDue: 2125,
    });

    expect(html).toContain("Living Room");
    expect(html).toContain("Honeycomb Shades");
    // No product thumbnails inside the line-item table (the only images in the
    // email are the header logo and the financing-section logos).
    const lineItemTable = html.slice(html.indexOf("Living Room"), html.indexOf("Two Financing Options"));
    expect(lineItemTable).not.toContain("<img");
    expect(lineItemTable).toContain("<strong>Product:</strong> Honeycomb Shades");
    expect(lineItemTable).toContain("<strong>Style:</strong> Cordless");
    expect(lineItemTable).toContain("<strong>Mount Type:</strong> Inside mount");
    expect(lineItemTable).not.toMatch(/Catalog Product|Catalog Manufacturer|Quote Lab/);
    expect(text).toContain("Contract items:");
    expect(text).toContain("Living Room - Product: Honeycomb Shades; Mount Type: Inside mount; Style: Cordless");
    expect(text).not.toMatch(/Catalog Product|Catalog Manufacturer|Quote Lab/);
    expect(text).not.toContain('72" W');
  });

  it("renders legacy/source total deltas as a generic contract adjustment", () => {
    const { html } = buildQuoteEmail("Jane Smith", "https://x/quote/abc", 4350, {
      subtotal: 4250,
      sourceTotalAdjustment: 100,
    });

    expect(html).toContain("Contract adjustment");
    expect(html).toContain("$100.00");
    expect(html).not.toContain("MTS");
    expect(html).not.toContain("source");
    expect(html).not.toContain("internal");
  });

  it("calls out every grouped quote and its price", () => {
    const { html, text } = buildQuoteEmail("Susan", "https://x/quote/abc", 3627, {
      versions: [
        { label: "A", total: 2181 },
        { label: "B", total: 2679 },
        { label: "C", total: 3627, current: true },
      ],
    });

    expect(text).toContain("This link includes 3 quotes to compare");
    expect(text).toContain("Quote A: $2,181.00");
    expect(text).toContain("Quote B: $2,679.00");
    expect(text).toContain("Quote C: $3,627.00");
    expect(html).toContain("3 quotes included");
    expect(html).toContain('padding:7px 12px 7px 0');
    expect(html).toContain('padding:7px 0 7px 12px');
    expect(html).not.toContain('display:flex;justify-content:space-between;gap:16px');
    expect(html).toContain("large tabs at the top");
    expect(html.match(/Review and approve contract/g)).toHaveLength(2);
    expect(html.match(/background:#dc2626/g)).toHaveLength(2);
    expect(html.indexOf("Review and approve contract")).toBeLessThan(html.indexOf("3 quotes included"));
    expect(html.lastIndexOf("Review and approve contract")).toBeGreaterThan(html.indexOf("3 quotes included"));
  });
});

describe("financing options section", () => {
  it("appears in the quote email with both options and the customer's monthly example", () => {
    const mail = buildQuoteEmail("Susan Milani", "https://example.com/q/abc", 6174, {
      quoteNumber: "Q-1042",
      depositDue: 3087,
      balanceDue: 3087,
      logoUrl: "https://www.805shutters.com/brand/805-shutters-logo-exact-transparent.png"
    });
    expect(mail.html).toContain("Two Financing Options Available!");
    expect(mail.html).toContain("Wisetack Financing");
    expect(mail.html).toContain("805 In-House Plan");
    // 3087 / 3 * 1.03 = 1059.87 -> $1,059.87/mo
    expect(mail.html).toContain("$1,059.87");
    expect(mail.html).toContain("3 payments");
    expect(mail.html).not.toContain("6 payments");
    expect(mail.html).not.toContain("6 monthly");
    expect(mail.html).toContain("/images/wisetack-logo.png");
    expect(mail.html).toContain("/brand/805-shutters-logo-exact-transparent.png");
    expect(mail.html).toContain("sms:+18058069344");
    expect(mail.html).toContain("Q-1042");
    expect(mail.html).toContain("subject to credit approval");
    expect(mail.text).toContain("TWO FINANCING OPTIONS AVAILABLE!");
    expect(mail.text).toContain("$1,059.87");
    expect(mail.text).toContain("3 monthly payments");
  });

  it("appears in the payment-link email and omits the monthly figure when no amounts are known", () => {
    const withAmounts = buildPaymentLinkEmail("Susan", "https://example.com/pay", {
      quoteNumber: "Q-1042",
      total: 6174,
      depositDue: 3087
    });
    expect(withAmounts.html).toContain("Two Financing Options Available!");
    expect(withAmounts.html).toContain("$1,059.87");
    expect(withAmounts.html).toContain("3 payments");

    const noAmounts = buildQuoteEmail("Susan", "https://example.com/q/abc", 0, {});
    expect(noAmounts.html).toContain("Two Financing Options Available!");
    expect(noAmounts.html).toContain("0% Interest");
    expect(noAmounts.html).toContain("up to 3 monthly payments");
    expect(noAmounts.html).not.toContain("/mo</span>");
  });
});

describe("buildPaymentLinkEmail", () => {
  it("includes Square, Venmo, Zelle, amount due, and the payment anchor link", () => {
    const { subject, html, text } = buildPaymentLinkEmail("Jane Smith", "https://x/quote/abc#payment", {
      depositDue: 2125,
      quoteNumber: "Q-100",
    });

    expect(subject).toContain("$2,125");
    expect(subject).toContain("deposit payment link");
    expect(html).toContain("https://x/quote/abc#payment");
    expect(html).toContain("Here is a payment link to pay the deposit");
    expect(html).toContain("new window coverings");
    expect(html).toContain("Square");
    expect(html).toContain("Venmo");
    expect(html).toContain("Zelle");
    expect(text).toContain("Hello Jane Smith");
    expect(text).toContain("Square card payment: https://x/quote/abc#payment");
    expect(text).toContain("Venmo: @");
    expect(text).toContain("Zelle");
    expect(text).toContain("Official 805 Shutters contact: 805Shutters.com | 805-806-9344");
    expect(html).toContain("805@805shutters.com");
  });
});

describe("sendEmail guards (never throws, no-ops without config)", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.BOOKING_EMAIL_FROM;
  });
  it("skips with no recipient", async () => {
    const r = await sendEmail({ to: "", subject: "s", html: "h", text: "t" });
    expect(r.sent).toBe(false);
    expect(r.skipped).toContain("recipient");
  });
  it("skips when Resend is not configured", async () => {
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(r.sent).toBe(false);
    expect(r.skipped).toBe("resend not configured");
  });
  it("uses the default quote sender when only the Resend API key is configured", () => {
    process.env.RESEND_API_KEY = "test-key";
    expect(isResendConfigured()).toBe(true);
  });
  it("passes a deterministic idempotency key to Resend", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "email-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await sendEmail({
        to: "customer@example.com",
        subject: "Paid in full",
        html: "<p>Thank you</p>",
        text: "Thank you",
        idempotencyKey: "customer-closeout-quote-1"
      });
      expect(result).toEqual({ sent: true, id: "email-1" });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "customer-closeout-quote-1" }) })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("buildSignedQuoteShopEmail", () => {
  it("flags the subject as signed and includes the customer, total, and link", () => {
    const { subject, html, text } = buildSignedQuoteShopEmail("Jane Smith", "https://x/quote/abc", 4250);
    expect(subject).toContain("Signed");
    expect(subject).toContain("$4,250");
    expect(subject).toContain("Jane Smith");
    expect(html).toContain("Signed");
    expect(html).toContain("https://x/quote/abc");
    expect(text).toContain("SIGNED");
  });
});
