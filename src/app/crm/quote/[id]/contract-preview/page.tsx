import { redirect } from "next/navigation";
import { QuoteContractPreviewStandalone } from "@/components/crm/quotes/QuoteContractPreviewStandalone";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Quote Contract | 805 CRM");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids arriving here are usually sales_quotes ids, but CRM records imported from the
// legacy MTS project can still carry quote ids that no longer resolve. Fall back to
// the CRM quote's share-token contract page instead of an empty builder shell.
async function resolveFallbackShareToken(id: string): Promise<string | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;

  const { data: byMeta } = await supabase
    .from("crm_quotes")
    .select("share_token")
    .or(`id.eq.${id},meta->>mts_quote_id.eq.${id},meta->>sales_quote_id.eq.${id}`)
    .not("share_token", "is", null)
    .limit(1)
    .maybeSingle();
  return typeof byMeta?.share_token === "string" && byMeta.share_token.trim() ? byMeta.share_token : null;
}

async function salesQuoteExists(id: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return true;

  const { data, error } = await supabase.from("sales_quotes").select("id").eq("id", id).maybeSingle();
  if (error) return true;
  return Boolean(data);
}

export default async function QuoteContractPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (UUID_PATTERN.test(id) && !(await salesQuoteExists(id))) {
    const shareToken = await resolveFallbackShareToken(id);
    if (shareToken) redirect(`/quote/${shareToken}?crmContract=1`);

    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "60px 20px", fontFamily: "system-ui, sans-serif", color: "#0b0b0b" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Contract unavailable</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          This quote is no longer in the quote builder and has no shared contract copy on file.
        </p>
      </main>
    );
  }

  return <QuoteContractPreviewStandalone quoteId={id} />;
}
