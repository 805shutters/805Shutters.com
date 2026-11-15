import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCrmUser } from "@/lib/crm/auth";
import { POST } from "./route";

vi.mock("@/lib/crm/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/crm/auth")>(),
  requireCrmUser: vi.fn(),
}));

const from = vi.fn(() => {
  throw new Error("A retired measure request must not read or write the job.");
});

beforeEach(() => {
  from.mockClear();
  vi.mocked(requireCrmUser).mockResolvedValue({
    supabase: { from } as never,
    email: "805shutters@gmail.com",
    user: { id: "staff" } as never,
    profile: null,
  } as never);
});

describe("measure-needed request action", () => {
  it.each([undefined, "request"])("returns 410 for %s and does not touch the job", async (action) => {
    const response = await POST(
      new NextRequest("https://805shutters.com/api/crm/jobs/job-1/measure-needed", {
        method: "POST",
        body: JSON.stringify(action ? { action } : {}),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("no longer used") });
    expect(from).not.toHaveBeenCalled();
  });
});
