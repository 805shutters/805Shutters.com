import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("shutters-near-me-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function ShuttersNearMeVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
