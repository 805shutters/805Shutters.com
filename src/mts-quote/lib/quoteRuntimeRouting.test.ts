import { describe, expect, it } from "vitest";
import { resolveActiveQuoteRuntime } from "./quoteRuntimeRouting";

describe("active quote runtime routing", () => {
  it.each([
    [{ quote_v2_backend: false }],
    [{ quote_v2_backend: null }],
    [{}],
  ])("keeps historical active quotes on the legacy runtime", (quote) => {
    expect(resolveActiveQuoteRuntime(quote)).toEqual({
      authoritativeV2: false,
      serverOwnedV2: false,
    });
  });

  it("keeps true V2 active quotes authoritative and server-owned", () => {
    expect(resolveActiveQuoteRuntime({ quote_v2_backend: true })).toEqual({
      authoritativeV2: true,
      serverOwnedV2: true,
    });
  });
});
