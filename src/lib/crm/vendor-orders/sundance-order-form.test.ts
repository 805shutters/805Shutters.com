import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SundanceOrderForm, type SundanceOrderFormSchema } from "@/components/crm/SundanceOrderForm";
import sheerViewJson from "../../../../public/order-form-templates/sundance/sundance_sheerview.schema.json";
import flatRomanJson from "../../../../public/order-form-templates/sundance/sundance_flat_roman.schema.json";

const sheerView = sheerViewJson as SundanceOrderFormSchema;
const flatRoman = flatRomanJson as SundanceOrderFormSchema;
const sourcePath = "data/order-entry/805-sundance-order-fields.json";
const sourceSha = "e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656";

describe("Sundance order form", () => {
  it("reads the copied field file at the recorded sha256", () => {
    expect(createHash("sha256").update(readFileSync(sourcePath)).digest("hex")).toBe(sourceSha);
  });

  it("renders SheerView choices and leaves live-check fields pending", () => {
    const html = renderToStaticMarkup(createElement(SundanceOrderForm, { schema: sheerView }));
    expect(html).toContain("Sundance SheerView Plus (sheer/banded vane shade)");
    expect(html).toContain("SheerView Plus");
    expect(html).toContain(">Inside<");
    expect(html).toContain(">Outside<");
    expect(html).toContain("Pending — needs live form check");
    expect(html).not.toContain("ST0142");
    const fabric = sheerView.fields.find((field) => field.key === "fabric_color");
    expect(fabric?.pending).toBe("needs live form check");
    expect(fabric?.choices).toEqual([]);
  });

  it("renders a blocked ordering type as blocked", () => {
    const html = renderToStaticMarkup(createElement(SundanceOrderForm, { schema: flatRoman }));
    expect(html).toContain("Blocked until Sundance confirms this ordering type.");
    expect(html).not.toContain("ST0142");
  });
});
