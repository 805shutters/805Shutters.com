import { describe, expect, it, vi } from "vitest";
import { copyPaymentText } from "./copyPaymentText";

describe("copyPaymentText", () => {
  it("keeps a synchronous fallback when the modern clipboard rejects", async () => {
    const order: string[] = [];
    const copied = await copyPaymentText("805-806-9344", {
      legacyCopy: (value) => {
        order.push(`legacy:${value}`);
        return true;
      },
      writeText: async (value) => {
        order.push(`modern:${value}`);
        throw new Error("clipboard unavailable");
      },
    });

    expect(copied).toBe(true);
    expect(order).toEqual(["legacy:805-806-9344", "modern:805-806-9344"]);
  });

  it("uses the modern clipboard when available", async () => {
    const writeText = vi.fn(async () => undefined);
    const copied = await copyPaymentText("805-806-9344", {
      legacyCopy: () => false,
      writeText,
    });

    expect(copied).toBe(true);
    expect(writeText).toHaveBeenCalledWith("805-806-9344");
  });

  it("reports failure when neither clipboard path succeeds", async () => {
    expect(await copyPaymentText("value", { legacyCopy: () => false })).toBe(false);
  });
});
