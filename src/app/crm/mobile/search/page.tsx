import { MobileCustomersApp } from "@/components/crm/MobileCustomersApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("Customer Info / Payments");

export default function MobileCustomerSearchPage() {
  return <MobileCustomersApp />;
}
