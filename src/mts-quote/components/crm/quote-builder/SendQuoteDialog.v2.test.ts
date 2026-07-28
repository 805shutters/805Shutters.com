import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("V2 send-as-is control", () => {
  it("defaults V2 sends to the immutable saved quote and sends that choice to the protected API", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./SendQuoteDialog.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("Send this quote exactly as saved");
    expect(source).toContain(
      "sendAsIs: quote.quote_v2_backend === true && sendAsIs",
    );
    expect(source).toMatch(/This decision is recorded\s+in CRM activity\./);
    expect(source).toContain(
      "useState(quote.quote_v2_backend === true)",
    );
    expect(source).toContain(
      "setSendAsIs(quote.quote_v2_backend === true)",
    );
  });
});
