import published from "../../content/wordpress/published.json";
import { optimizeEditorialImages } from "./editorial-images";

export type EditorialPage = {
  title: string;
  description: string;
  intro: string;
  html: string;
};

const pages: Record<string, EditorialPage> = published;

export function editorialPage(path: string) {
  const page = Object.hasOwn(pages, path) ? pages[path] : undefined;
  return page ? { ...page, html: optimizeEditorialImages(page.html, ["/", "/bay-window-project/"].includes(path)) } : undefined;
}
