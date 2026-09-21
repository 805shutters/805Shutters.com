import { NextRequest, NextResponse } from 'next/server';
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from '@/lib/crm/auth';
import { createSalesQuoteRevision, parseQuoteRevisionBody } from '@/lib/crm/sales-quote-revisions';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const input = parseQuoteRevisionBody(await request.json().catch(() => { throw new CrmAuthError(400, 'A valid revision request is required.'); }));
    const { id } = await context.params;
    return NextResponse.json(await createSalesQuoteRevision(supabase, user.id, id, input), { status: 201 });
  } catch (error) { return crmAuthErrorResponse(error); }
}
