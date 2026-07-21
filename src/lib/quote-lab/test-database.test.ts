import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  QuoteLabRevisionConflictError,
  QuoteV2TestDatabase,
  type PersistedQuoteLabState,
} from "./test-database";

const temporaryDirectories: string[] = [];

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "805-quote-v2-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "quote-lab.sqlite");
}

function state(lineCount = 1): PersistedQuoteLabState {
  return {
    quotes: [{ id: "quote-v2" }],
    lineItems: Array.from({ length: lineCount }, (_, index) => ({
      id: `line-${index + 1}`,
      quote_id: "quote-v2",
      quantity: 99,
    })),
    designs: [],
    selectedVariantByLine: {},
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("isolated Quote V2 test database", () => {
  it("durably saves and reloads test quote state independently of quantity", () => {
    const path = databasePath();
    const first = new QuoteV2TestDatabase(path);
    const saved = first.save("workspace", state(40), 0);
    expect(saved.revision).toBe(1);
    first.close();

    const reopened = new QuoteV2TestDatabase(path);
    const loaded = reopened.load("workspace");
    expect(loaded?.revision).toBe(1);
    expect(loaded?.state.lineItems).toHaveLength(40);
    expect(loaded?.state.lineItems[39]).toMatchObject({ id: "line-40" });
    reopened.close();
  });

  it("rejects a 41st line and a concurrent stale revision transaction", () => {
    const database = new QuoteV2TestDatabase(databasePath());
    expect(() => database.save("workspace", state(41), 0)).toThrow(
      "no more than 40 line items",
    );
    database.save("workspace", state(1), 0);
    expect(() => database.save("workspace", state(2), 0)).toThrow(
      QuoteLabRevisionConflictError,
    );
    expect(database.load("workspace")?.state.lineItems).toHaveLength(1);
    database.close();
  });
});
