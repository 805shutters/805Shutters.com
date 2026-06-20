import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("plantation-shutters-vs-shades-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function PlantationShuttersVsShadesVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
