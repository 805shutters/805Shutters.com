import { NextRequest, NextResponse } from "next/server";
import { bearerToken, defaultStaffAlertDeps, deliverHeldStaffAlerts, secretsMatch } from "@/lib/crm/staff-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 14:00 UTC is 7:00 AM Pacific Daylight Time. 15:00 UTC is 7:00 AM Pacific Standard Time.
// Rows stay held until deliver_at, so the extra hour does not send early.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim() || "";
  if (!secret) return NextResponse.json({ error: "Cron secret is not configured." }, { status: 503 });
  const provided = bearerToken(request.headers.get("authorization"));
  if (!provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return deliverHeldStaffAlerts(defaultStaffAlertDeps());
}
