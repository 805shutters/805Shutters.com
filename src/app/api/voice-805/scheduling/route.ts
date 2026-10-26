import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// This phone-only bridge is retired. Manual and web CRM scheduling are separate.
export async function POST(_request: Request) {
  return NextResponse.json({ error: 'Phone appointment booking is retired. Take a callback message.', saved: false },
    { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
