import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { VENMO_HANDLE, ZELLE_DESTINATION, venmoProfileUrl } from "@/lib/finance/payment-options";
import { privatePageMetadata } from "@/lib/private-page-metadata";
import { CustomerContractDocument } from "./CustomerContractDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Contract | 805 Shutters");

type PublicQuotePageSearchParams = Record<string, string | string[] | undefined>;

function searchParamEnabled(searchParams: PublicQuotePageSearchParams, key: string) {
  const value = searchParams[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first === "" || first === "1" || first === "true";
}

export default async function PublicQuotePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<PublicQuotePageSearchParams>;
}) {
  const { token } = await params;
  const query = searchParams ? await searchParams : {};
  const crmContractPreview = searchParamEnabled(query, "crmContract");
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return (
      <main style={wrap}>
        <p>This contract is temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }

  const quote = await loadPublicQuoteByToken(supabase, token);
  if (!quote) notFound();
  // Venmo profile QR (static per handle) so the customer can scan to pay.
  const venmoQrSvg = await QRCode.toString(venmoProfileUrl(), { type: "svg", margin: 1 });

  return <CustomerContractDocument quote={quote} embedded={crmContractPreview}
    paymentOptions={{ venmoHandle: VENMO_HANDLE, venmoQrSvg, zelleDestination: ZELLE_DESTINATION }} />;
}

const wrap = { maxWidth: 760, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#0b0b0b" } as const;
