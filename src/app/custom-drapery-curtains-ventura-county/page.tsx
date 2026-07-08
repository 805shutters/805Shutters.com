import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("custom-drapery-curtains-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function CustomDraperyCurtainsVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
