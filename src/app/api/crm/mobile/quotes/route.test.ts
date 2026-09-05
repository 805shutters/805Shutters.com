import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/crm/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crm/auth")>()),
  requireCrmUser: mocks.auth,
}));
import { CrmAuthError } from "@/lib/crm/auth";
import { GET } from "./route";

function database(fail = false) {
  const records: Record<string, unknown[]> = {
    crm_jobs: Array.from({ length: 1005 }, (_, index) => ({
      id: String(index),
      customer_name: index === 1004 ? "Last Customer" : "Other Name",
      meta: {},
    })),
    crm_quotes: [
      {
        id: "last",
        job_id: "1004",
        status: "draft",
        created_at: "2026-09-01",
        meta: {},
      },
    ],
    crm_customer_contracts: [],
  };
  return {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        order: vi.fn(() => builder),
        range: vi.fn(async (from: number, to: number) => ({
          data: records[table].slice(from, to + 1),
          error:
            fail && table === "crm_quotes" ? { message: "unavailable" } : null,
        })),
      };
      return builder;
    }),
  };
}
const request = (query: string) =>
  new NextRequest(`http://localhost/api/crm/mobile/quotes?${query}`);
describe("authenticated mobile contract search", () => {
  beforeEach(() => vi.clearAllMocks());
  it("finds older customers beyond the former 1000-row cap without loading the workspace", async () => {
    const db = database();
    mocks.auth.mockResolvedValue({ supabase: db });
    const response = await GET(request("q=last"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).results[0].contracts[0].id).toBe("last");
    expect(db.from.mock.calls.map((call) => call[0])).not.toContain(
      "sales_quotes",
    );
  });
  it("requires authorization before touching records", async () => {
    mocks.auth.mockRejectedValue(new CrmAuthError(401, "Sign in again"));
    expect((await GET(request("q=jam"))).status).toBe(401);
  });
  it("rejects invalid cursors and avoids blank-search reads", async () => {
    const db = database();
    mocks.auth.mockResolvedValue({ supabase: db });
    expect((await GET(request("q=jam&offset=-1"))).status).toBe(400);
    expect((await GET(request("q=jam&letter=AB"))).status).toBe(400);
    expect(await (await GET(request("q=j"))).json()).toEqual({
      results: [],
      nextOffset: null,
    });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("returns an error instead of misleading partial results", async () => {
    mocks.auth.mockResolvedValue({ supabase: database(true) });
    expect((await GET(request("q=last"))).status).toBe(502);
  });
});
