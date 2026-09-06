import { describe, expect, it } from "vitest";
import {
  hubEmail,
  hubOffer,
  hubTemplate,
  validateHubDraft,
} from "./quote-hub-model";
import { DEFAULT_ADJUSTMENTS, computeQuoteMoney } from "./quote-money";
import { hubGmailText } from "./quote-hub-gmail";
import { hubReplyMatches } from "./quote-hub";
const adjustments = {
  ...DEFAULT_ADJUSTMENTS,
  fees: [{ name: "Freight", amount: 200 }],
  taxPercent: 10,
  depositPercent: 50,
};
const basis = {
  subtotal: 1000,
  total: 1320,
  adjustments,
  allPriced: true,
  sourceAdjustment: 0,
};
const draft = {
  action: "savings" as const,
  ...hubTemplate("savings", "Paul Lee"),
  percent: 10,
  photoIds: [],
};
describe("sent quote communication", () => {
  it("discounts products, retains freight, recalculates tax and deposit", () => {
    const offer = hubOffer(basis, 10);
    expect(offer.money.extrasTotal).toBe(200);
    expect(offer.money.discountAmount).toBe(100);
    expect(offer.money.taxAmount).toBe(110);
    expect(offer.total).toBe(1210);
    expect(offer.savings).toBe(110);
    expect(offer.money.depositRequired).toBe(605);
  });
  it("preserves existing discounts instead of stacking full undiscounted amounts", () => {
    const a = { ...adjustments, discountPercent: 10 };
    const total = computeQuoteMoney(1000, a).total;
    const offer = hubOffer({ ...basis, adjustments: a, total }, 10);
    expect(offer.adjustments.discountPercent).toBe(10);
    expect(offer.adjustments.discountFlat).toBe(90);
    expect(offer.money.taxAmount).toBe(99);
  });
  it.each([0, -1, 51, NaN, Infinity])(
    "rejects unsafe percentage %s",
    (percent) => expect(() => hubOffer(basis, percent)).toThrow(),
  );
  it("rejects unpriced, stale and legacy-unreconciled money", () => {
    expect(() => hubOffer({ ...basis, allPriced: false }, 10)).toThrow();
    expect(() => hubOffer({ ...basis, total: 1300 }, 10)).toThrow();
    expect(() => hubOffer({ ...basis, sourceAdjustment: 200 }, 10)).toThrow();
    expect(() =>
      hubOffer(
        { ...basis, adjustments: { ...adjustments, balanceDueOverride: 5 } },
        10,
      ),
    ).toThrow();
  });
  it("creates distinct editable templates", () => {
    expect(hubTemplate("interested", "Paul Lee").body).toContain("Hi Paul");
    expect(hubTemplate("inspiration", "Paul Lee").body).toContain("photos");
    expect(hubTemplate("personal", "Paul Lee").body).not.toContain("wish list");
  });
  it("rejects injected subjects, missing photos and excessive messages", () => {
    expect(() =>
      validateHubDraft({ ...draft, subject: "Hello\r\nBcc: bad@example.com" }),
    ).toThrow();
    expect(() =>
      validateHubDraft({ ...draft, action: "inspiration" }),
    ).toThrow();
    expect(() =>
      validateHubDraft({ ...draft, body: "x".repeat(12001) }),
    ).toThrow();
  });
  it("escapes email content and includes the exact offer summary", () => {
    const mail = hubEmail(
      { ...draft, body: "<script>alert(1)</script>" },
      hubOffer(basis, 10),
      "https://805shutters.com/quote/test",
      [],
    );
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.text).toContain("$1,210.00");
    expect(mail.text).toContain("10% additional savings on products");
  });
  it("matches replies by sender plus exact quote reference or RFC thread reference", () => {
    const m = {
      id: "1",
      payload: {
        headers: [
          { name: "From", value: "Paul <paul@example.com>" },
          { name: "Subject", value: "Re: Your project [805-0233]" },
        ],
      },
    };
    expect(hubReplyMatches(m, "paul@example.com", "805-0233", [])).toBe(true);
    expect(hubReplyMatches(m, "other@example.com", "805-0233", [])).toBe(false);
    expect(hubReplyMatches(m, "paul@example.com", "805-023", [])).toBe(false);
    m.payload.headers[1] = {
      name: "References",
      value: "<abc@805shutters.com>",
    };
    expect(
      hubReplyMatches(m, "paul@example.com", "805-0233", [
        "<abc@805shutters.com>",
      ]),
    ).toBe(true);
  });
  it("extracts inbound text without rendering customer HTML", () => {
    expect(
      hubGmailText({
        mimeType: "text/plain",
        body: { data: Buffer.from("Still interested!").toString("base64url") },
      }),
    ).toBe("Still interested!");
    expect(
      hubGmailText({
        mimeType: "text/html",
        body: {
          data: Buffer.from("<script>bad()</script><p>Hi</p>").toString(
            "base64url",
          ),
        },
      }),
    ).not.toContain("bad()");
  });
});
