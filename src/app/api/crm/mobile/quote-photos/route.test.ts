import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), upload: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/crm/auth", () => {
  class MockCrmAuthError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
  return {
    CrmAuthError: MockCrmAuthError,
    requireCrmUser: mocks.auth,
    crmAuthErrorResponse: (error: unknown) => {
      const source = error as { status?: number; message?: string };
      return NextResponse.json({ message: source.message }, { status: source.status ?? 500 });
    },
  };
});
vi.mock("@/lib/crm/mobile-quote-photos", () => ({
  MOBILE_QUOTE_PHOTO_MAX_BYTES: 2 * 1024 * 1024,
  uploadMobileQuotePhoto: mocks.upload,
  listMobileQuotePhotos: mocks.list,
}));

import { CrmAuthError } from "@/lib/crm/auth";
import { GET, POST } from "./route";

const ACTOR_ID = "44444444-4444-4444-8444-444444444444";

describe("mobile quote photo route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ supabase: {}, user: { id: ACTOR_ID } });
    mocks.upload.mockResolvedValue({ photo: { photoId: "photo" }, idempotent: false });
    mocks.list.mockResolvedValue([]);
  });

  it("authenticates before listing private photos and disables caching", async () => {
    const request = new NextRequest("http://localhost/api/crm/mobile/quote-photos?quoteId=11111111-1111-4111-8111-111111111111");
    const response = await GET(request);
    expect(mocks.auth).toHaveBeenCalledWith(request);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ photos: [] });
  });

  it("returns the authentication failure without reading photo metadata", async () => {
    mocks.auth.mockRejectedValue(new CrmAuthError(401, "CRM session is required."));
    const request = new NextRequest("http://localhost/api/crm/mobile/quote-photos?quoteId=11111111-1111-4111-8111-111111111111");
    expect((await GET(request)).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("passes one multipart photo to the server helper", async () => {
    const form = new FormData();
    form.set("quoteId", "11111111-1111-4111-8111-111111111111");
    form.set("lineItemId", "22222222-2222-4222-8222-222222222222");
    form.set("photoId", "33333333-3333-4333-8333-333333333333");
    form.set("file", new Blob([new Uint8Array([0x89])], { type: "image/png" }), "photo.png");
    const request = new NextRequest("http://localhost/api/crm/mobile/quote-photos", { method: "POST", body: form });
    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledWith({}, ACTOR_ID, expect.objectContaining({
      quoteId: "11111111-1111-4111-8111-111111111111",
      lineItemId: "22222222-2222-4222-8222-222222222222",
      photoId: "33333333-3333-4333-8333-333333333333",
      file: expect.anything(),
    }));
  });
});
