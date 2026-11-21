import type { EditorialPage } from "@/lib/wordpress-editorial";
import "./wordpress-editorial.css";

export function WordPressContent({ page, studio = false }: { page: EditorialPage; studio?: boolean }) {
  // HTML is sanitized by the WordPress exporter before it enters the release.
  return <div className={studio ? "wp-studio" : "wp-article"} dangerouslySetInnerHTML={{ __html: page.html }} />;
}
