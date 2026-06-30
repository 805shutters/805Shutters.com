import { CrmApp } from "@/components/crm/CrmApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 CRM");

export default function CrmPage() {
  return <CrmApp />;
}
