import { MobileJobStatusApp } from "@/components/crm/MobileTechnicianApps";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 Job Status");

export default function MobileJobStatusPage() {
  return <MobileJobStatusApp />;
}
