import { NextRequest } from "next/server";
import { quoterServiceGuard } from "@/lib/crm/quoter-service-auth";
import { handleStaffAlert } from "@/lib/crm/staff-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const quoterDenied = quoterServiceGuard(request);
  if (quoterDenied) return quoterDenied;
  return handleStaffAlert(request);
}
