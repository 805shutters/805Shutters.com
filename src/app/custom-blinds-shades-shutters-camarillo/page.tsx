import { AnswerPage } from "@/components/AnswerPage";
import { answerPageMetadata, getAnswerPage } from "@/lib/llm-search-pages";

const page = getAnswerPage("custom-blinds-shades-shutters-camarillo")!;

export const metadata = answerPageMetadata(page);

export default function CustomBlindsShadesShuttersCamarilloPage() {
  return <AnswerPage page={page} />;
}
