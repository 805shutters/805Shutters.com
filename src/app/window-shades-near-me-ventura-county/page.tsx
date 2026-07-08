import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("window-shades-near-me-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function WindowShadesNearMeVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
