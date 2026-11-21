import { editorialPage } from "@/lib/wordpress-editorial";
import { WordPressContent } from "@/components/WordPressContent";

const page = editorialPage("/window-guide/")!;

export const metadata = {
  title: page.title,
  description: page.description || "Compare shutters, shades, and blinds for light and privacy in your home.",
  alternates: { canonical: "/window-guide/" }
};

export default function EditorialStory() {
  return <WordPressContent page={page} studio />;
}
