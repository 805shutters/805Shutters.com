import { CrmApp } from "@/components/crm/CrmApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 Customer and Appointment Search");

export default function MobileCustomerSearchPage() {
  return <CrmApp initialTab="command" loginRedirectPath="/crm/mobile/search" />;
}
