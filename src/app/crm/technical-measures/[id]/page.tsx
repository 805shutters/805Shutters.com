import { Metadata } from "next";
import { TechnicalMeasureEditor } from "@/components/crm/TechnicalMeasureEditor";

export const metadata: Metadata = { title: "Technical Measure | 805 CRM", robots: { index: false, follow: false } };

export default async function TechnicalMeasurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TechnicalMeasureEditor formId={id} />;
}
