import { NextRequest } from "next/server";
import { handleOnyxLineEventWake } from "@/lib/crm/onyx-line-event-worker";
import { quoterServiceGuard } from "@/lib/crm/quoter-service-auth";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const quoterDenied = quoterServiceGuard(request);
  if (quoterDenied) return quoterDenied;
  const supabase = getSupabaseServiceClient();
  if (!supabase) return handleOnyxLineEventWake(request, null);
  return handleOnyxLineEventWake(request, {
    rpc: async (fn, args) => supabase.rpc(fn, args),
  });
}
