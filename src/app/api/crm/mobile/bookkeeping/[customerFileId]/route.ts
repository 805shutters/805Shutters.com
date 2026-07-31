import { NextRequest, NextResponse } from "next/server";
import { requireCrmUser, crmAuthErrorResponse } from "@/lib/crm/auth";
import { loadCrmDashboardData } from "@/lib/crm/backend";
import { findMobileBookkeepingFileById } from "@/lib/crm/mobile-bookkeeping";
import { restrictBookkeepingRowForViewer } from "@/lib/crm/payables-visibility";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ customerFileId: string }> }
) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const { customerFileId } = await context.params;
    const dashboard = await loadCrmDashboardData(supabase);
    const file = findMobileBookkeepingFileById(
      dashboard.customerFiles,
      decodeURIComponent(customerFileId)
    );

    if (!file) {
      return NextResponse.json(
        { message: "That customer financial file is no longer available." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      file: {
        ...file,
        bookkeepingRows: file.bookkeepingRows.map((row) => restrictBookkeepingRowForViewer(row, email))
      }
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
