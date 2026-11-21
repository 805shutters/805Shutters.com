import { CrmApp } from "@/components/crm/CrmApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";
export const metadata = privatePageMetadata("805 Stripe reconciliation");
export default function StripePage() {
  return <CrmApp initialTab="stripe" />;
}
