import { editorialPage } from "@/lib/wordpress-editorial";
import { WordPressContent } from "@/components/WordPressContent";

const page = editorialPage("/bay-window-project/")!;

export const metadata = {
  title: page.title,
  description: page.description || "See how 805 Shutters fitted plantation shutter panels to the angles of a bay window.",
  alternates: { canonical: "/bay-window-project/" }
};

export default function EditorialStory() {
  return <WordPressContent page={page} studio />;
}
