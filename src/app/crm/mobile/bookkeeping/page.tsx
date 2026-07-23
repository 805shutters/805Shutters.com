import { MobileBookkeepingApp } from "@/components/crm/MobileBookkeepingApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 Mobile Bookkeeping");

export default function MobileBookkeepingPage() {
  return <MobileBookkeepingApp />;
}
