import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./QuoteBuilderPanel.tsx", import.meta.url)),
  "utf8",
);

describe("historical CRM quote read-only fallback", () => {
  it("shows the original line structure without edit, send, contract, or payment controls", () => {
    const readOnlyBranch = source.slice(
      source.indexOf("if (readOnly)"),
      source.indexOf("const inner ="),
    );

    expect(readOnlyBranch).toContain("Historical Quote — Read Only");
    expect(readOnlyBranch).toContain("quote.lineItems.map");
    expect(readOnlyBranch).not.toContain("sendToCustomer");
    expect(readOnlyBranch).not.toContain("sendPaymentLink");
    expect(readOnlyBranch).not.toContain("openContract");
    expect(readOnlyBranch).not.toContain("mutate(");
  });
});
