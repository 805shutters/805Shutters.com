import { CrmMobileQuotesApp } from "@/components/crm/CrmMobileQuotesApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 Contracts");

export default function MobileContractsPage() {
  return <CrmMobileQuotesApp workspace="contracts" />;
}
