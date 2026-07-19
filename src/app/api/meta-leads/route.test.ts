import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { mapMetaFieldData, verifyMetaSignature } from "@/lib/meta-leads";

describe("mapMetaFieldData", () => {
  it("maps standard Instant Form fields", () => {
    const mapped = mapMetaFieldData([
      { name: "full_name", values: ["Jane Homeowner"] },
      { name: "phone_number", values: ["+18055551234"] },
      { name: "email", values: ["jane@example.com"] },
      { name: "city", values: ["Camarillo"] }
    ]);
    expect(mapped).toEqual({
      name: "Jane Homeowner",
      phone: "+18055551234",
      email: "jane@example.com",
      city: "Camarillo",
      notes: null
    });
  });

  it("joins first/last name and collects qualifying questions as notes", () => {
    const mapped = mapMetaFieldData([
      { name: "first_name", values: ["Jane"] },
      { name: "last_name", values: ["Homeowner"] },
      { name: "do_you_own_your_home?", values: ["Yes"] },
      { name: "project_timeframe", values: ["1-3 months"] }
    ]);
    expect(mapped.name).toBe("Jane Homeowner");
    expect(mapped.notes).toBe("do_you_own_your_home?: Yes\nproject_timeframe: 1-3 months");
  });

  it("tolerates empty and missing values", () => {
    expect(mapMetaFieldData(undefined)).toEqual({ name: null, phone: null, email: null, city: null, notes: null });
    expect(mapMetaFieldData([{ name: "email", values: [""] }]).email).toBeNull();
  });
});

describe("verifyMetaSignature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ entry: [] });
  const sign = (raw: string, key: string) => `sha256=${createHmac("sha256", key).update(raw, "utf8").digest("hex")}`;

  it("accepts a valid signature", () => {
    expect(verifyMetaSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a wrong secret, tampered body, and malformed header", () => {
    expect(verifyMetaSignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyMetaSignature(body + " ", sign(body, secret), secret)).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", secret)).toBe(false);
  });
});
