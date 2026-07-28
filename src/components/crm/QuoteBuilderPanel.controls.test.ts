import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./QuoteBuilderPanel.tsx", import.meta.url)),
  "utf8",
);

describe("QuoteBuilderPanel restored V1 controls", () => {
  it("copies the source spec to every other line while preserving target sizes", () => {
    const copyAll = source.slice(
      source.indexOf("const copySpecToAll"),
      source.indexOf("// Copy Some:"),
    );
    expect(copyAll).toContain(
      "const others = quote.lineItems.filter((li) => li.id !== sourceId);",
    );
    expect(copyAll).toContain("Sizes stay unchanged.");
    expect(copyAll).not.toContain(
      "li.id !== sourceId && canReceiveCopiedSpec(source, li)",
    );
  });

  it("renders a validated custom line amount control through the authenticated API", () => {
    expect(source).toContain('label="Custom amount $"');
    expect(source).toContain("Update line price");
    expect(source).toContain(
      "mutate(`/api/crm/quote-designs/${design.id}/price`",
    );
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("Number.isFinite(parsed) && parsed >= 0");
  });

  it("keeps blank Add Quote separate from snapshot-preserving Copy Current", () => {
    expect(source).toMatch(/onClick=\{\(\) => createVersion\(false\)\}[^>]*>\s*Add Quote/s);
    expect(source).toMatch(/onClick=\{\(\) => createVersion\(true\)\}[^>]*>\s*Copy Current/s);
    expect(source).toContain("onClick={() => createVersion(false)}");
    expect(source).toContain("onClick={() => createVersion(true)}");
    expect(source).toContain("JSON.stringify({ copyCurrent })");
    expect(source).toContain("Saved line items, customer prices, and pricing provenance will be preserved.");
  });
});
