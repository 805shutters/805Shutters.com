import { NextRequest, NextResponse } from "next/server";
import {
  crmAuthErrorResponse,
  CrmAuthError,
  requireCrmUser,
} from "@/lib/crm/auth";
import { collectCrmPages } from "@/lib/crm/pagination";
import {
  searchMobileQuotes,
  type MobileQuoteJob,
  type MobileQuoteRow,
  type MobileQuoteRelationship,
} from "@/lib/crm/mobile-quotes";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const query = (request.nextUrl.searchParams.get("q") || "")
      .trim()
      .slice(0, 150);
    const letter = (
      request.nextUrl.searchParams.get("letter") || ""
    ).toUpperCase();
    const offset = Number(request.nextUrl.searchParams.get("offset") || 0);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      (letter && !/^[A-Z]$/.test(letter))
    )
      throw new CrmAuthError(400, "Choose a valid search page or letter.");
    if (query.length < 2 && !letter)
      return NextResponse.json({ results: [], nextOffset: null }, { headers });
    // Narrow projections, fully paged at the database and customer-result levels.
    // Do not reuse the dashboard's capped reads or hydrate pricing/payment data for search.
    const [jobs, quotes, relationships] = await Promise.all([
      collectCrmPages<MobileQuoteJob>((from, to) =>
        supabase
          .from("crm_jobs")
          .select("id,customer_name,address,city,meta")
          .order("id")
          .range(from, to),
      ),
      collectCrmPages<MobileQuoteRow>((from, to) =>
        supabase
          .from("crm_quotes")
          .select(
            "id,job_id,quote_number,quote_label,status,created_at,signed_at,customer_printed_name,customer_email,customer_phone,customer_address,meta",
          )
          .order("id")
          .range(from, to),
      ),
      collectCrmPages<MobileQuoteRelationship>((from, to) =>
        supabase
          .from("crm_customer_contracts")
          .select("job_id,quote_id,customer_id,meta")
          .order("id")
          .range(from, to),
      ),
    ]);
    if (jobs.error || quotes.error || relationships.error)
      throw new CrmAuthError(
        502,
        "Contracts could not be searched. Please try again.",
      );
    return NextResponse.json(
      searchMobileQuotes(
        jobs.data || [],
        quotes.data || [],
        relationships.data || [],
        query.length >= 2 ? query : "",
        letter,
        offset,
      ),
      { headers },
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
