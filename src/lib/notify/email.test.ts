import { describe, it, expect, beforeEach } from "vitest";
import { buildPaymentLinkEmail, buildQuoteEmail, buildSignedQuoteShopEmail, isResendConfigured, sendEmail } from "./email";

describe("buildQuoteEmail", () => {
  it("includes the amount, link, and customer name", () => {
    const { subject, html, text } = buildQuoteEmail("Jane Smith", "https://x/quote/abc", 4250);
    expect(subject).toContain("$4,250");
    expect(html).toContain("https://x/quote/abc");
    expect(text).toContain("Jane Smith");
    expect(html).toContain("Jane Smith");
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
          dimensions: '72" W x 48" H',
          productName: "Honeycomb Shades",
          styleName: "Cordless",
          options: ["Inside mount"],
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
    expect(html).not.toContain("<img");
    expect(html).not.toContain("/images/");
    expect(text).toContain("Quote items:");
    expect(text).toContain("Living Room - Honeycomb Shades - Cordless");
  });

  it("renders legacy/source total deltas as a generic quote adjustment", () => {
    const { html } = buildQuoteEmail("Jane Smith", "https://x/quote/abc", 4350, {
      subtotal: 4250,
      sourceTotalAdjustment: 100,
    });

    expect(html).toContain("Quote adjustment");
    expect(html).toContain("$100.00");
    expect(html).not.toContain("MTS");
    expect(html).not.toContain("source");
    expect(html).not.toContain("internal");
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
