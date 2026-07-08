import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("window-treatment-company-near-me-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function WindowTreatmentCompanyNearMeVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
