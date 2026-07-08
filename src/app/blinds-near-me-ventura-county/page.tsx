import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("blinds-near-me-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function BlindsNearMeVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
