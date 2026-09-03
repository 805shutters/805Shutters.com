import { CrmApp } from "@/components/crm/CrmApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = privatePageMetadata("805 CRM");

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const tracking = (await searchParams).view === "tracking";
  const userAgent = (await headers()).get("user-agent") || "";
  const isIpad = /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent));

  if (isIpad && !tracking) {
    redirect("/crm/mobile/quotes");
  }

  return <CrmApp initialTab={tracking ? "tracking" : "command"} />;
}
