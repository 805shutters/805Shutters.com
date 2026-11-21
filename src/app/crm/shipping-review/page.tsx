import { ShippingReviewList } from "@/components/crm/ShippingReviewList";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("Shipping review");

export default function ShippingReviewPage() {
  return <ShippingReviewList />;
}
