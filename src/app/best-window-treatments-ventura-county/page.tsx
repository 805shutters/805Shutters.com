import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("best-window-treatments-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function BestWindowTreatmentsVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
