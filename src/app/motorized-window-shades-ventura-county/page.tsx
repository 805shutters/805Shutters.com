import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("motorized-window-shades-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function MotorizedWindowShadesVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
