import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("window-treatment-installation-timeline-ventura-county")!;

export const metadata = answerPageMetadata(page);

export default function WindowTreatmentInstallationTimelineVenturaCountyPage() {
  return <AnswerPage page={page} />;
}
