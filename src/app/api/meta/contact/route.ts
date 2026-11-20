import { NextRequest, NextResponse } from "next/server";
import { sendMetaBrowserEvent } from "@/lib/meta-capi";
import { cleanEventId, isMetaBotOrPrefetch } from "@/lib/meta-user-data";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (isMetaBotOrPrefetch(request.headers)) {
    return NextResponse.json({ sent: false, skipped: "bot_or_prefetch" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (!cleanEventId(record.eventId)) {
    return NextResponse.json({ message: "eventId is required" }, { status: 400 });
  }
  try {
    await sendMetaBrowserEvent(request, {
      eventName: "Contact",
      eventId: record.eventId,
      pageUrl: record.pageUrl,
      fbp: record.fbp,
      fbc: record.fbc,
      fbclid: record.fbclid,
    });
    return NextResponse.json({ sent: true });
  } catch (error) {
    const code = error instanceof Error && /^META_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "META_DELIVERY_FAILURE";
    if (code !== "META_TOKEN_MISSING") console.error("Meta Contact not sent", { code });
    return NextResponse.json({ sent: false, skipped: code });
  }
}
