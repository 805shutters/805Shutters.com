"use client";

import { usePathname } from "next/navigation";
import { schemaPath } from "@/lib/structured-data-identity";

// Next renders this script into the initial HTML. Path selection also keeps
// it correct during client navigation for every sitemap page.
export function BusinessStructuredData({ original, corrected, paths }: {
  original: string;
  corrected: string;
  paths: string[];
}) {
  const path = usePathname();
  const useCorrection = path && paths.includes(schemaPath(path));
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: useCorrection ? corrected : original }} />;
}
