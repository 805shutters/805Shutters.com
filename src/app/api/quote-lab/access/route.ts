import { NextRequest, NextResponse } from "next/server";
import {
  QUOTE_LAB_COOKIE,
  QUOTE_LAB_COOKIE_MAX_AGE,
  QUOTE_LAB_WORKSPACE_COOKIE,
  QuoteLabConfigurationError,
  createQuoteLabWorkspaceNonce,
  quoteLabSessionToken,
  verifyQuoteLabAccessCode,
} from "@/lib/quote-lab/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    if (!verifyQuoteLabAccessCode(body.code)) {
      return NextResponse.json({ error: "That access code is not valid." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: QUOTE_LAB_COOKIE,
      value: quoteLabSessionToken(),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: QUOTE_LAB_COOKIE_MAX_AGE,
    });
    response.cookies.set({
      name: QUOTE_LAB_WORKSPACE_COOKIE,
      value: createQuoteLabWorkspaceNonce(),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: QUOTE_LAB_COOKIE_MAX_AGE,
    });
    return response;
  } catch (error) {
    if (error instanceof QuoteLabConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Quote Lab access could not be verified." }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  for (const name of [QUOTE_LAB_COOKIE, QUOTE_LAB_WORKSPACE_COOKIE]) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
