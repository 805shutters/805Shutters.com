import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { QUOTE_LAB_MAX_LINES } from "./types";

export type PersistedQuoteLabState = {
  quotes: unknown[];
  lineItems: unknown[];
  designs: unknown[];
  selectedVariantByLine: Record<string, string>;
};

export type PersistedQuoteLabEnvelope = {
  state: PersistedQuoteLabState;
  revision: number;
  updatedAt: string;
};

export class QuoteLabRevisionConflictError extends Error {}

function assertState(value: unknown): asserts value is PersistedQuoteLabState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Quote Lab state must be an object.");
  }
  const state = value as Record<string, unknown>;
  if (
    !Array.isArray(state.quotes) ||
    !Array.isArray(state.lineItems) ||
    !Array.isArray(state.designs) ||
    !state.selectedVariantByLine ||
    typeof state.selectedVariantByLine !== "object" ||
    Array.isArray(state.selectedVariantByLine)
  ) {
    throw new TypeError("Quote Lab state is missing its required tables.");
  }
  if (state.lineItems.length > QUOTE_LAB_MAX_LINES) {
    throw new RangeError(
      `A quote can contain no more than ${QUOTE_LAB_MAX_LINES} line items.`,
    );
  }
}

function parseState(value: string): PersistedQuoteLabState {
  const parsed: unknown = JSON.parse(value);
  assertState(parsed);
  return parsed;
}

export class QuoteV2TestDatabase {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    if (!path.trim()) throw new TypeError("A V2 test database path is required.");
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS quote_v2_test_state (
        workspace_id TEXT PRIMARY KEY NOT NULL,
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 1),
        updated_at TEXT NOT NULL
      ) STRICT
    `);
  }

  load(workspaceId: string): PersistedQuoteLabEnvelope | null {
    const row = this.database
      .prepare(
        "SELECT state_json, revision, updated_at FROM quote_v2_test_state WHERE workspace_id = ?",
      )
      .get(workspaceId) as
      | { state_json: string; revision: number; updated_at: string }
      | undefined;
    if (!row) return null;
    return {
      state: parseState(row.state_json),
      revision: row.revision,
      updatedAt: row.updated_at,
    };
  }

  save(
    workspaceId: string,
    state: PersistedQuoteLabState,
    expectedRevision: number,
  ): PersistedQuoteLabEnvelope {
    if (!workspaceId.trim()) throw new TypeError("A workspace ID is required.");
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new TypeError("Expected revision must be a non-negative integer.");
    }
    assertState(state);
    const serialized = JSON.stringify(state);
    const updatedAt = new Date().toISOString();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.database
        .prepare(
          "SELECT revision FROM quote_v2_test_state WHERE workspace_id = ?",
        )
        .get(workspaceId) as { revision: number } | undefined;
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        throw new QuoteLabRevisionConflictError(
          `Quote Lab state changed concurrently (expected revision ${expectedRevision}, current revision ${currentRevision}).`,
        );
      }
      const revision = currentRevision + 1;
      this.database
        .prepare(`
          INSERT INTO quote_v2_test_state (
            workspace_id, state_json, revision, updated_at
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(workspace_id) DO UPDATE SET
            state_json = excluded.state_json,
            revision = excluded.revision,
            updated_at = excluded.updated_at
        `)
        .run(workspaceId, serialized, revision, updatedAt);
      this.database.exec("COMMIT");
      return { state: parseState(serialized), revision, updatedAt };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

let sharedDatabase: QuoteV2TestDatabase | null = null;

export function quoteV2TestDatabasePath(): string {
  return (
    process.env.QUOTE_V2_TEST_DATABASE_PATH?.trim() ||
    "/tmp/805-quote-system-v2/quote-lab.sqlite"
  );
}

export function sharedQuoteV2TestDatabase(): QuoteV2TestDatabase {
  sharedDatabase ??= new QuoteV2TestDatabase(quoteV2TestDatabasePath());
  return sharedDatabase;
}
