import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  quoteLabWorkspaceId,
  quoteLabUnauthorizedResponse,
} from "@/lib/quote-lab/auth";
import { createFreshQuoteLabWorkspace } from "@/lib/quote-lab/fresh-workspace";
import {
  QuoteLabRevisionConflictError,
  sharedQuoteV2TestDatabase,
  type PersistedQuoteLabState,
} from "@/lib/quote-lab/test-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const workspaceId = quoteLabWorkspaceId(request);
  if (!workspaceId) return quoteLabUnauthorizedResponse();
  const stored = sharedQuoteV2TestDatabase().load(workspaceId);
  return NextResponse.json(stored ?? { state: null, revision: 0, updatedAt: null });
}

export async function PUT(request: NextRequest) {
  const workspaceId = quoteLabWorkspaceId(request);
  if (!workspaceId) return quoteLabUnauthorizedResponse();
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
        workspaceId,
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

export async function POST(request: NextRequest) {
  const workspaceId = quoteLabWorkspaceId(request);
  if (!workspaceId) return quoteLabUnauthorizedResponse();
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const keys = Object.keys(body);
    if (
      keys.length !== 1 ||
      keys[0] !== "expectedRevision" ||
      !Number.isInteger(body.expectedRevision)
    ) {
      return NextResponse.json(
        { error: "Only the current expected revision may be submitted for a fresh reset." },
        { status: 400 },
      );
    }
    const fresh = createFreshQuoteLabWorkspace(randomUUID());
    const stored = sharedQuoteV2TestDatabase().reset(
      workspaceId,
      fresh.state,
      body.expectedRevision as number,
    );
    return NextResponse.json({
      ...stored,
      runId: fresh.runId,
      quoteNumber: fresh.quoteNumber,
      createdAt: fresh.createdAt,
    });
  } catch (error) {
    if (error instanceof QuoteLabRevisionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The isolated V2 test database rejected the fresh reset.",
      },
      { status: 400 },
    );
  }
}
