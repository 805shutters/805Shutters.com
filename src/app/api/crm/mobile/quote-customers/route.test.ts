import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/crm/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crm/auth")>()),
  requireCrmUser: mocks.auth,
}));
import { GET } from "./route";

function database(rows: unknown[]) {
  const state = { or: "", range: [] as number[] };
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.or = vi.fn((filter: string) => { state.or = filter; return builder; });
  builder.order = vi.fn(() => builder);
  builder.range = vi.fn((from: number, to: number) => { state.range = [from, to]; return Promise.resolve({ data: rows, error: null }); });
  return { client: { from: vi.fn(() => builder) } as never, state };
}

function request(query: string) {
  return new NextRequest(`http://localhost/api/crm/mobile/quote-customers?${query}`);
}

describe("mobile quote customer relationship search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("escapes PostgREST wildcard and syntax input and returns an explicit cursor", async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({
      id: `job-${index}`,
      customer_name: `Customer ${index}`,
      phone: "",
      email: "",
      address: "",
      city: "",
    }));
    const db = database(rows);
    mocks.auth.mockResolvedValue({ supabase: db.client });
    const response = await GET(request("q=Pat%25_name%2C(test)&cursor=30"));
    const body = await response.json();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(db.state.range).toEqual([30, 60]);
    expect(db.state.or).toContain("Pat\\%\\_name test");
    expect(body.results).toHaveLength(30);
    expect(body.nextCursor).toBe("60");
    expect(body.results[0]).toHaveProperty("jobId", "job-0");
  });

  it("rejects invalid cursors and avoids blank searches", async () => {
    const db = database([]);
    mocks.auth.mockResolvedValue({ supabase: db.client });
    expect((await GET(request("q=Pat&cursor=-1"))).status).toBe(400);
    expect(await (await GET(request("q=p"))).json()).toEqual({ results: [], nextCursor: null });
    expect((db.client as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});
