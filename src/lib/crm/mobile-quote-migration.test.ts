import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../supabase/migrations/20260905170000_mobile_quote_relationships_and_private_photos.sql", import.meta.url),
  "utf8",
);

describe("mobile quote relationship and private photo migration", () => {
  it("binds the selected job into canonical idempotency before draft creation", () => {
    expect(sql).toMatch(/p_quote_patch\s*\|\|\s*jsonb_build_object\('mobileCreatedJobId',\s*p_created_job_id\)/);
    expect(sql).toMatch(/public\.create_quote_v2_draft\(/);
    expect(sql.indexOf("jsonb_build_object('mobileCreatedJobId'")).toBeLessThan(sql.indexOf("update public.sales_quotes"));
    expect(sql).not.toMatch(/create or replace function public\.create_quote_v2_draft/);
  });

  it("rejects missing or deleted CRM jobs before any quote is created", () => {
    expect(sql).toMatch(/perform jobs\.id[\s\S]*from public\.crm_jobs jobs[\s\S]*jobs\.id = p_created_job_id[\s\S]*jobs\.meta ->> 'deleted_at'[\s\S]*for share/);
    expect(sql).not.toMatch(/for key share/i);
    expect(sql.indexOf("perform jobs.id")).toBeLessThan(sql.indexOf("v_result := public.create_quote_v2_draft"));
    expect(sql).toMatch(/missing or deleted.*P0002/s);
  });

  it("guards the relationship by exact 805 account, actor ownership, and null-or-same identity", () => {
    expect(sql).toContain("quotes.account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid");
    expect(sql).toContain("quotes.created_by = p_actor_id");
    expect(sql).toContain("quotes.created_job_id is null");
    expect(sql).toContain("quotes.created_job_id = p_created_job_id");
    expect(sql).toMatch(/v_relationship_count = 0 and not exists[\s\S]*errcode = '23505'/);
  });

  it("creates a private constrained bucket and service-role-only RLS metadata", () => {
    expect(sql).toMatch(/'mobile-quote-photos'[\s\S]*false,[\s\S]*2097152/);
    expect(sql).toContain("array['image/jpeg', 'image/png', 'image/webp']::text[]");
    expect(sql).toContain("alter table public.mobile_quote_photos enable row level security");
    expect(sql).toContain("revoke all on public.mobile_quote_photos from public, anon, authenticated");
    expect(sql).not.toMatch(/create policy/i);
  });
});
