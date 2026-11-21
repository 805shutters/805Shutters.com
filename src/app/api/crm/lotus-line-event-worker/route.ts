import { NextRequest } from "next/server";
import { handleLotusLineEventWake } from "@/lib/crm/lotus-line-event-worker";
import { quoterServiceGuard } from "@/lib/crm/quoter-service-auth";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  const quoterDenied = quoterServiceGuard(request);
  if (quoterDenied) return quoterDenied;
  const supabase = getSupabaseServiceClient();
  if (!supabase) return handleLotusLineEventWake(request, null);
  return handleLotusLineEventWake(request, {
    rpc: async (fn, args) => supabase.rpc(fn, args),
  });
}
