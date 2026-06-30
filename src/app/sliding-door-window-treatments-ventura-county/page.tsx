import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("sliding-door-window-treatments-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function SlidingDoorWindowTreatmentsVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
