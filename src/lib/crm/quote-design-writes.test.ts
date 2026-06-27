import { describe, expect, it } from "vitest";
import { saveQuoteDesignRecord } from "./quote-design-writes";

describe("saveQuoteDesignRecord", () => {
  it("retries without optional columns when production schema has not applied them yet", async () => {
    const attempts: Record<string, unknown>[] = [];
    const saved = await saveQuoteDesignRecord(
      {
        line_item_id: "line-1",
        details: { mount_type: "inside" },
        wholesale_unit_price: 123.45,
        unit_price: 456.78,
      },
      async (record) => {
        attempts.push({ ...record });
        if ("details" in record) {
          return {
            data: null,
            error: {
              code: "PGRST204",
              message: "Could not find the 'details' column of 'crm_quote_designs' in the schema cache",
            },
          };
        }
        if ("wholesale_unit_price" in record) {
          return {
            data: null,
            error: {
              code: "PGRST204",
              message: "Could not find the 'wholesale_unit_price' column of 'crm_quote_designs' in the schema cache",
            },
          };
        }
        return { data: { id: "design-1" }, error: null };
      },
      "Design could not be saved.",
    );

    expect(saved).toEqual({ id: "design-1" });
    expect(attempts).toHaveLength(3);
    expect(attempts[0]).toHaveProperty("details");
    expect(attempts[1]).not.toHaveProperty("details");
    expect(attempts[1]).toHaveProperty("wholesale_unit_price");
    expect(attempts[2]).not.toHaveProperty("details");
    expect(attempts[2]).not.toHaveProperty("wholesale_unit_price");
  });

  it("does not hide non-optional schema errors", async () => {
    await expect(
      saveQuoteDesignRecord(
        { line_item_id: "line-1", unit_price: 456.78 },
        async () => ({
          data: null,
          error: {
            code: "PGRST204",
            message: "Could not find the 'unit_price' column of 'crm_quote_designs' in the schema cache",
          },
        }),
        "Design could not be saved.",
      ),
    ).rejects.toThrow("unit_price");
  });
});
