import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("window-treatment-cost-guide-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function WindowTreatmentCostGuideVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
