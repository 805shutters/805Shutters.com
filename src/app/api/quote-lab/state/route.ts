import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  isQuoteLabAuthorized,
  QUOTE_LAB_COOKIE,
  quoteLabUnauthorizedResponse,
} from "@/lib/quote-lab/auth";
import {
  QuoteLabRevisionConflictError,
  sharedQuoteV2TestDatabase,
  type PersistedQuoteLabState,
} from "@/lib/quote-lab/test-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workspaceId(request: NextRequest): string {
  const session = request.cookies.get(QUOTE_LAB_COOKIE)?.value ?? "";
  return createHash("sha256")
    .update(`805-quote-v2-test:${session}`, "utf8")
    .digest("hex");
}

export async function GET(request: NextRequest) {
  if (!isQuoteLabAuthorized(request)) return quoteLabUnauthorizedResponse();
  const stored = sharedQuoteV2TestDatabase().load(workspaceId(request));
  return NextResponse.json(stored ?? { state: null, revision: 0, updatedAt: null });
}

export async function PUT(request: NextRequest) {
  if (!isQuoteLabAuthorized(request)) return quoteLabUnauthorizedResponse();
  try {
    const body = (await request.json()) as {
      state?: PersistedQuoteLabState;
      expectedRevision?: number;
    };
    if (!body.state || !Number.isInteger(body.expectedRevision)) {
      return NextResponse.json(
        { error: "State and expected revision are required." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      sharedQuoteV2TestDatabase().save(
        workspaceId(request),
        body.state,
        body.expectedRevision as number,
      ),
    );
  } catch (error) {
    if (error instanceof QuoteLabRevisionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The isolated V2 test database rejected the state.",
      },
      { status: 400 },
    );
  }
}
