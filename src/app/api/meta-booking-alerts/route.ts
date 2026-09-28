import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { metaBookingSource } from "@/lib/meta-booking-alert";
import { metaBookingSmsEnabled, sendMetaBookingSms } from "@/lib/notify/meta-booking-sms";

export const runtime = "nodejs";
const siteOrigins = new Set(["https://www.805shutters.com", "https://805shutters.com", "https://805-one.vercel.app"]);

export async function POST(request: NextRequest) {
  if (!siteOrigins.has(request.headers.get("origin") || "")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!metaBookingSmsEnabled()) return NextResponse.json({ sent: false, skipped: "disabled" });
  const raw = await request.text();
  if (raw.length > 4096) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid_payload" }, { status: 400 }); }
  if (!body || typeof body.sessionId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.sessionId) ||
      typeof body.path !== "string" || !body.path.startsWith("/") || body.path.startsWith("//") ||
      (body.referrer !== undefined && typeof body.referrer !== "string")) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const source = metaBookingSource(body.path, body.referrer, request.headers.get("user-agent") || "");
  if (!source) return NextResponse.json({ sent: false, skipped: "not_meta_booking" });
  // Vercel supplies this header; do not trust a client-provided IP in the JSON body.
  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return NextResponse.json({ sent: false, skipped: "missing_client_ip" });
  const db = getSupabaseServiceClient();
  if (!db) return NextResponse.json({ sent: false, skipped: "database_unavailable" }, { status: 503 });
  try { return NextResponse.json(await sendMetaBookingSms(db, { sessionId: body.sessionId, source, ip })); }
  catch { return NextResponse.json({ sent: false, skipped: "alert_unavailable" }, { status: 503 }); }
}
