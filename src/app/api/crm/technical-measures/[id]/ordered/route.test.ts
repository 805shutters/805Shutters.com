import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/crm/auth", async (original) => ({
  ...(await original<typeof import("@/lib/crm/auth")>()),
  requireCrmUser: mocks.auth,
}));
vi.mock("@/lib/crm/technical-measure-orders-server", () => ({
  markMeasureProductOrdered: mocks.save,
}));
import { POST } from "./route";
import { CrmAuthError } from "@/lib/crm/auth";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    supabase: {},
    email: "staff@example.com",
    user: { id: "actor" },
  });
  mocks.save.mockResolvedValue({ id: "form" });
});
const call = (body: unknown) =>
  POST(
    new NextRequest(
      "http://localhost/api/crm/technical-measures/form/ordered",
      { method: "POST", body: JSON.stringify(body) },
    ),
    { params: Promise.resolve({ id: "form" }) },
  );
it("uses the authenticated actor and exact form, ignoring client order evidence", async () => {
  expect(
    (
      await call({
        groupKey: "norman:faux_wood",
        orderedAt: "fake",
        actor: "other",
        lineIds: ["foreign"],
      })
    ).status,
  ).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith({}, "form", "norman:faux_wood", {
    email: "staff@example.com",
    userId: "actor",
  });
});
it("rejects missing products and unauthorized mutations", async () => {
  expect((await call({})).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.auth.mockRejectedValue(new CrmAuthError(403, "Read only"));
  expect((await call({ groupKey: "norman:faux_wood" })).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});
