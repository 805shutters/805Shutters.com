import { describe, it, expect } from "vitest";
import { ZELLE_DESTINATION } from "./payment-options";

describe("payment options", () => {
  it("retains the configured Zelle destination", () => {
    expect(ZELLE_DESTINATION).toBe(process.env.ZELLE_DESTINATION || "805-806-9344");
  });
});
