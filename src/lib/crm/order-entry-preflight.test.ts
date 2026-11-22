import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ORDER_ENTRY_FIELD_FILE,
  ORDER_ENTRY_FIELD_FILE_SHA256,
  ORDER_ENTRY_MANUFACTURER_ROLES,
  ORDER_ENTRY_WAKE_EXCLUDED,
  ORDER_ENTRY_WAKE_TRANSPORT,
} from "@/lib/crm/order-entry-preflight";

const migrationPath = "supabase/migrations/20261122030000_order_entry_preflight.sql";

describe("order-entry field file", () => {
  it("keeps the handed-off file byte for byte", () => {
    const bytes = readFileSync(ORDER_ENTRY_FIELD_FILE);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(ORDER_ENTRY_FIELD_FILE_SHA256);
    const file = JSON.parse(bytes.toString("utf8")) as {
      generated: string;
      products: unknown[];
      sundance: { status: string };
      order_level_fields: Record<string, unknown>;
    };
    expect(file.generated).toBe("2026-11-21 (America/Los_Angeles)");
    expect(file.products).toHaveLength(43);
    expect(file.sundance.status).toBe("missing");
    expect(Object.keys(file.order_level_fields).length).toBeGreaterThan(0);
  });
});

describe("order-entry migration", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("is additive, leaves seed values alone, and documents a disabled HTTP wake", () => {
    expect(migrationPath).toMatch(/20261122030000/);
    expect("20261122030000" > "20261122020000").toBe(true);
    expect(migration).toContain(ORDER_ENTRY_FIELD_FILE_SHA256);
    expect(migration).toContain("required_for_order");
    expect(migration).toContain("vendor_field_name");
    expect(migration).toContain("value_translation");
    expect(migration).toContain("conditional_rules");
    expect(migration).toContain("Merge and apply order");
    const executable = migration.replace(/--.*$/gm, "").replace(/alter column event_id drop not null/gi, "");
    expect(executable).not.toMatch(/\bdelete\s+from\b/i);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/\bdrop\b/i);
    expect(executable).not.toMatch(/add column if not exists applies_when/i);
    expect(executable).not.toMatch(/set applies_when/i);
    expect(executable).not.toMatch(/set required =/);
    expect(migration).not.toMatch(/ask_order =/);
    expect(migration).not.toMatch(/input_kind =/);
    expect(migration).toContain("manufacturer_bot_norman");
    expect(migration).toContain("line_event.needs_input");
    expect(migration).toContain("quote_sequence_applies_state");
    expect(migration).not.toContain("line_event.field_results");
    expect(migration).not.toContain("norman_line_worker");
    expect(migration).not.toMatch(/create or replace function public\.wake_line_event_worker/);
    for (const role of Object.values(ORDER_ENTRY_MANUFACTURER_ROLES)) {
      expect(migration).toContain(role);
    }
    expect(ORDER_ENTRY_WAKE_TRANSPORT).toBe("http");
    expect(ORDER_ENTRY_WAKE_EXCLUDED).toEqual(["polar"]);
    expect(migration).not.toContain("polar_line_worker");
  });
});
