import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260730161000_track_sold_quote_sms_delivery_status.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("sold quote SMS provider-status migration", () => {
  it("distinguishes provider acceptance from carrier delivery", () => {
    expect(migration).toMatch(/where status = 'sent'/i);
    expect(migration).toMatch(/status = 'accepted'/i);
    expect(migration).toContain("'delivered'");
    expect(migration).toContain("'undelivered'");
  });

  it("matches callbacks by a unique provider SID", () => {
    expect(migration).toMatch(
      /create unique index[\s\S]*provider_message_sid[\s\S]*is not null/i,
    );
    expect(migration).toMatch(
      /where notification\.provider_message_sid = p_message_sid/i,
    );
  });

  it("keeps terminal outcomes when callbacks arrive out of order", () => {
    expect(migration).toMatch(
      /when notification\.status in \('delivered', 'undelivered'\)[\s\S]*then notification\.status/i,
    );
  });

  it("keeps the callback RPC private to the service role", () => {
    expect(migration).toMatch(
      /revoke all on function[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function[\s\S]*to service_role/i,
    );
  });
});
