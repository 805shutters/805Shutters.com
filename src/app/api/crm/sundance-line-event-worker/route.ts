import { NextRequest } from "next/server";
import { handleSundanceLineEventWake } from "@/lib/crm/sundance-line-event-worker";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return handleSundanceLineEventWake(request, null);
  return handleSundanceLineEventWake(request, {
    rpc: async (fn, args) => supabase.rpc(fn, args),
  });
}
