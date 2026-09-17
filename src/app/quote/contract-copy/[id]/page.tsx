import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { privatePageMetadata } from "@/lib/private-page-metadata";
import { contractSnapshotDigest, verifyContractRenderAuthorization } from "@/lib/crm/signed-contract-render-auth";
import { signedSnapshotPublicQuote, validateSignedContractSnapshot } from "@/lib/crm/signed-contract-snapshot";
import { CustomerContractDocument } from "../../[token]/CustomerContractDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Signed Contract | 805 Shutters");

// Internal print surface. The proof is short-lived, bound to one immutable snapshot,
// and sent in a navigation header rather than a shareable URL or referrer.
export default async function SignedContractCopy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const digest = requestHeaders.get("x-contract-digest") || "";
  if (!verifyContractRenderAuthorization({ id, digest,
    expires: Number(requestHeaders.get("x-contract-expires")), proof: requestHeaders.get("x-contract-proof") || "",
    secret: process.env.CRON_SECRET || "",
  })) notFound();
  const supabase = getSupabaseServiceClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.from("crm_customer_signed_contract_email_outbox")
    .select("signed_snapshot,customer_signature,quote_id,contract_signed_at").eq("id", id).maybeSingle();
  if (error || !data || contractSnapshotDigest(data.signed_snapshot) !== digest) notFound();
  const snapshot = validateSignedContractSnapshot(data.signed_snapshot, data.customer_signature);
  if (snapshot.quote.id !== data.quote_id || Date.parse(snapshot.signedAt) !== Date.parse(data.contract_signed_at)) notFound();
  return <div data-contract-digest={digest}>
    <CustomerContractDocument quote={signedSnapshotPublicQuote(snapshot)} previewOnly
      contractTerms={snapshot.terms} previewLabel="Signed contract copy" />
  </div>;
}
