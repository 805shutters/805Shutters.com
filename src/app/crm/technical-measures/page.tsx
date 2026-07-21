import { Metadata } from "next";
import { TechnicalMeasureList } from "@/components/crm/TechnicalMeasureEditor";

export const metadata: Metadata = { title: "Technical Measures | 805 CRM", robots: { index: false, follow: false } };

export default function TechnicalMeasuresPage() {
  return <TechnicalMeasureList />;
}
