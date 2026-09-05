import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 150);
    const rawCursor = request.nextUrl.searchParams.get("cursor");
    if (rawCursor !== null && !/^\d+$/.test(rawCursor)) {
      return NextResponse.json({ message: "Customer search cursor is invalid." }, { status: 400 });
    }
    const cursor = rawCursor === null ? 0 : Number(rawCursor);
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > 100_000) {
      return NextResponse.json({ message: "Customer search cursor is invalid." }, { status: 400 });
    }
    if (query.length < 2) return NextResponse.json({ results: [], nextCursor: null }, { headers: { "Cache-Control": "private, no-store" } });
    const escaped = query
      .replace(/[\\%_*]/g, (value) => `\\${value}`)
      .replace(/[,()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (escaped.length < 2) return NextResponse.json({ results: [], nextCursor: null }, { headers: { "Cache-Control": "private, no-store" } });
    const result = await supabase
      .from("crm_jobs")
      .select("id,customer_name,phone,email,address,city,meta")
      .is("meta->>deleted_at", null)
      .or(`customer_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%,address.ilike.%${escaped}%`)
      .order("customer_name", { ascending: true })
      .order("id", { ascending: true })
      .range(cursor, cursor + 30);
    if (result.error) return NextResponse.json({ message: "Customers could not be searched." }, { status: 502 });
    const rows = result.data || [];
    return NextResponse.json({
      results: rows.slice(0, 30).map((job) => ({
        jobId: job.id,
        name: job.customer_name || "Customer",
        phone: job.phone || "",
        email: job.email || "",
        address: [job.address, job.city].filter(Boolean).join(", "),
      })),
      nextCursor: rows.length > 30 ? String(cursor + 30) : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
