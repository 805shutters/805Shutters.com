import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  fileURLToPath(new URL("../../../mts-quote.css", import.meta.url)),
  "utf8",
);

function rule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector} \\{([\\s\\S]*?)\\}`));

  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("quote product button colors", () => {
  it("uses a platinum background with distinct hover and selected states", () => {
    expect(rule(".mts-quote-scope .quote-product-option")).toContain("background: #e5e4e2;");
    expect(rule(".mts-quote-scope .quote-product-option:hover")).toContain("background: #dcdbd6;");
    expect(rule(".mts-quote-scope .quote-product-option--selected")).toContain("background: #cfcdc6;");
  });
});
