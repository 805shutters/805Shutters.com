import { CrmApp } from "@/components/crm/CrmApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("Ken Bookkeeping | 805 CRM");

export default function KenCrmPage() {
  return <CrmApp mode="ken" />;
}
