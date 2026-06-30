import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("commercial-roller-shades-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function CommercialRollerShadesVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
