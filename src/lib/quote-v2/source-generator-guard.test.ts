import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("quote V2 source generator guards", () => {
  it("refuses unexpected Honeycomb workbook bytes before writing output", () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), "805-honeycomb-source-guard-"),
    );
    const output = path.join(temporaryDirectory, "generated.ts");
    try {
      const result = spawnSync(
        "python3",
        [
          path.join(process.cwd(), "scripts/generate-norman-honeycomb-v2-source.py"),
          path.join(process.cwd(), "package.json"),
          output,
        ],
        { encoding: "utf8" },
      );
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "Refusing unexpected Honeycomb workbook bytes",
      );
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("refuses unexpected Polar PDF bytes before overwriting the catalog", () => {
    const catalogPath = path.join(
      process.cwd(),
      "src/lib/quote/catalog/polar-shades.catalog.json",
    );
    const catalogBefore = readFileSync(catalogPath);
    const result = spawnSync(
      "python3",
      [
        path.join(process.cwd(), "scripts/generate-polar-catalog.py"),
        path.join(process.cwd(), "package.json"),
      ],
      { encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "Polar PDF SHA-256 mismatch",
    );
    expect(readFileSync(catalogPath)).toEqual(catalogBefore);
  });
});
