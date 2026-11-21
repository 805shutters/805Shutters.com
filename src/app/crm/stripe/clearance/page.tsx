import { SquareClearanceReview } from "@/components/crm/SquareClearanceReview";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("Square clearance review");

export default function SquareClearanceReviewPage() {
  return <SquareClearanceReview />;
}
