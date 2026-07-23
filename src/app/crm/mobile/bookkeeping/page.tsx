import { CrmApp } from "@/components/crm/CrmApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 Mobile Bookkeeping");

export default function MobileBookkeepingPage() {
  return <CrmApp initialTab="bookkeeping" loginRedirectPath="/crm/mobile/bookkeeping" />;
}
