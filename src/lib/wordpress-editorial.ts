import published from "../../content/wordpress/published.json";

export type EditorialPage = {
  title: string;
  description: string;
  intro: string;
  html: string;
};

const pages: Record<string, EditorialPage> = published;

export function editorialPage(path: string) {
  return Object.hasOwn(pages, path) ? pages[path] : undefined;
}
