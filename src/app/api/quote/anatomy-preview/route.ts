import { NextRequest, NextResponse } from 'next/server';
import { anatomyPreviewProduct } from '@/lib/quote/contract-anatomy-catalog';
export function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return new NextResponse(null, { status:404 });
  const product = anatomyPreviewProduct(request.nextUrl.searchParams.get('product') || '');
  return product ? NextResponse.json(product, { headers:{'Cache-Control':'no-store'} }) : new NextResponse(null, {status:404});
}
