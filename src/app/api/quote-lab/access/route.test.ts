import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  QUOTE_LAB_COOKIE,
  QUOTE_LAB_WORKSPACE_COOKIE,
  quoteLabSessionToken,
} from "@/lib/quote-lab/auth";
import { DELETE, POST } from "./route";

const originalCode = process.env.QUOTE_LAB_ACCESS_CODE;

afterEach(() => {
  if (originalCode === undefined) delete process.env.QUOTE_LAB_ACCESS_CODE;
  else process.env.QUOTE_LAB_ACCESS_CODE = originalCode;
});

function unlock(code: string) {
  return POST(
    new NextRequest("http://localhost/api/quote-lab/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  );
}

describe("Quote Lab unlock workspace isolation", () => {
  it("sets stable auth and a different random HttpOnly workspace nonce per unlock", async () => {
    process.env.QUOTE_LAB_ACCESS_CODE = "local-route-test-code";
    const first = await unlock("local-route-test-code");
    const second = await unlock("local-route-test-code");
    expect(first.status).toBe(200);
    expect(first.cookies.get(QUOTE_LAB_COOKIE)?.value).toBe(quoteLabSessionToken());
    expect(first.cookies.get(QUOTE_LAB_WORKSPACE_COOKIE)?.value).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(second.cookies.get(QUOTE_LAB_WORKSPACE_COOKIE)?.value).not.toBe(
      first.cookies.get(QUOTE_LAB_WORKSPACE_COOKIE)?.value,
    );

    const setCookie = first.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${QUOTE_LAB_COOKIE}=`);
    expect(setCookie).toContain(`${QUOTE_LAB_WORKSPACE_COOKIE}=`);
    expect(setCookie.match(/HttpOnly/gi)).toHaveLength(2);
    expect(setCookie.match(/SameSite=strict/gi)).toHaveLength(2);
    expect(setCookie.match(/Path=\//gi)).toHaveLength(2);
  });

  it("clears both auth and workspace cookies on lock", async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(response.cookies.get(QUOTE_LAB_COOKIE)?.value).toBe("");
    expect(response.cookies.get(QUOTE_LAB_WORKSPACE_COOKIE)?.value).toBe("");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie.match(/Max-Age=0/gi)).toHaveLength(2);
  });
});
