import { MobileContractsApp } from "@/components/crm/MobileTechnicianApps";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 Contracts");

export default function MobileContractsPage() {
  return <MobileContractsApp />;
}
