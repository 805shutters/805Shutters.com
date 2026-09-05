import { describe, expect, it, vi } from "vitest";
import { BROKER_MAILBOX, handle805GmailTokenRequest } from "./gmail-token-broker";

const secret = "synthetic-broker-secret-with-at-least-32-characters";
function setup(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    GMAIL_805_TOKEN_BROKER_SECRET: secret,
    GMAIL_805_CLIENT_ID: "805-client", GMAIL_805_CLIENT_SECRET: "805-secret",
    GMAIL_805_REFRESH_TOKEN: "older-env-refresh-token",
    SUPABASE_URL: "https://database.example.test", SUPABASE_SERVICE_ROLE_KEY: "database-secret",
    ...overrides,
  };
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json([{ refresh_token: "stored-refresh-token" }]))
    .mockResolvedValueOnce(Response.json({ access_token: "805-access-token", scope: "https://www.googleapis.com/auth/gmail.modify", expires_in: 3600 }))
    .mockResolvedValueOnce(Response.json({ emailAddress: BROKER_MAILBOX }));
  return { env: (name: string) => env[name], fetch };
}
function request(body: unknown = { action: "access-token", emailAddress: BROKER_MAILBOX }, auth = `Bearer ${secret}`) {
  return new Request("https://broker.example.test", { method: "POST", headers: { authorization: auth }, body: JSON.stringify(body) });
}

describe("805-only Gmail token broker", () => {
  it.each(["", "Bearer wrong", "Bearer database-secret"])("denies unauthenticated or unrelated credentials %s before accessing secrets", async (auth) => {
    const deps = setup();
    expect((await handle805GmailTokenRequest(request(undefined, auth), deps)).status).toBe(401);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("fails closed when its dedicated secret is absent", async () => {
    const deps = setup({ GMAIL_805_TOKEN_BROKER_SECRET: undefined });
    expect((await handle805GmailTokenRequest(request(), deps)).status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it.each(["mtsinstallations@gmail.com", "mtsshutters@gmail.com", "805@805shutters.com", ""])("cannot request another mailbox: %s", async (emailAddress) => {
    const deps = setup();
    expect((await handle805GmailTokenRequest(request({ action: "access-token", emailAddress }), deps)).status).toBe(403);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it.each([null, {}, { action: "exchange", emailAddress: BROKER_MAILBOX }])("rejects unsupported requests without side effects", async (body) => {
    const deps = setup();
    expect((await handle805GmailTokenRequest(request(body), deps)).status).toBe(400);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("uses only the stored 805 token and verifies profile before returning an uncached token", async () => {
    const deps = setup();
    const response = await handle805GmailTokenRequest(request(), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true, emailAddress: BROKER_MAILBOX, accessToken: "805-access-token", expiresIn: 3600 });
    const lookup = new URL(String(deps.fetch.mock.calls[0][0]));
    expect(lookup.searchParams.get("email_address")).toBe(`eq.${BROKER_MAILBOX}`);
    const form = deps.fetch.mock.calls[1][1]?.body as URLSearchParams;
    expect(form.get("refresh_token")).toBe("stored-refresh-token");
    expect(form.get("client_id")).toBe("805-client");
    expect(deps.fetch.mock.calls[2][0]).toBe("https://gmail.googleapis.com/gmail/v1/users/me/profile");
  });
  it("does not fall back to MTS OAuth credentials", async () => {
    const deps = setup({ GMAIL_805_CLIENT_SECRET: undefined, GOOGLE_CLIENT_SECRET: "mts-secret" });
    expect((await handle805GmailTokenRequest(request(), deps)).status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("does not silently fall back after credential lookup fails", async () => {
    const deps = setup(); deps.fetch.mockReset().mockResolvedValue(Response.json({ error: "internal-secret" }, { status: 503 }));
    const response = await handle805GmailTokenRequest(request(), deps);
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("internal-secret");
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["https://www.googleapis.com/auth/gmail.readonly", "", "https://www.googleapis.com/auth/calendar"])("rejects insufficient scopes %s", async (scope) => {
    const deps = setup(); deps.fetch.mockReset()
      .mockResolvedValueOnce(Response.json([{ refresh_token: "stored" }]))
      .mockResolvedValueOnce(Response.json({ access_token: "not-released", scope }));
    const response = await handle805GmailTokenRequest(request(), deps);
    expect(response.status).toBe(403); expect(await response.text()).not.toContain("not-released");
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects a token belonging to MTS even if it has Gmail scopes", async () => {
    const deps = setup(); deps.fetch.mockReset()
      .mockResolvedValueOnce(Response.json([{ refresh_token: "stored" }]))
      .mockResolvedValueOnce(Response.json({ access_token: "not-released", scope: "https://www.googleapis.com/auth/gmail.modify" }))
      .mockResolvedValueOnce(Response.json({ emailAddress: "mtsinstallations@gmail.com" }));
    const response = await handle805GmailTokenRequest(request(), deps);
    expect(response.status).toBe(403); expect(await response.text()).not.toContain("not-released");
  });
  it("redacts provider exceptions", async () => {
    const deps = setup(); deps.fetch.mockReset().mockRejectedValue(new Error("sensitive-provider-details"));
    const response = await handle805GmailTokenRequest(request(), deps);
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("sensitive-provider-details");
  });
});
