import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { productImage } from "./product-images";
import { catalog } from "./catalog";

describe("productImage", () => {
  it("maps every catalog product type to an image that exists in /public", () => {
    const types = new Set(catalog.products.map((p) => p.productType));
    for (const type of types) {
      const path = productImage(type);
      expect(path.startsWith("/images/"), `${type} -> ${path}`).toBe(true);
      expect(existsSync(join(process.cwd(), "public", path)), `missing file for ${type}: ${path}`).toBe(true);
    }
  });

  it("falls back to an existing image for unknown types", () => {
    const path = productImage("does_not_exist");
    expect(existsSync(join(process.cwd(), "public", path))).toBe(true);
  });
});
