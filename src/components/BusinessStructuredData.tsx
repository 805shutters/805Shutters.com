"use client";

import { usePathname } from "next/navigation";
import { isProtectedSchemaPath, schemaPath } from "@/lib/structured-data-identity";

// Next renders this script into the initial HTML. Path selection also keeps
// it correct during client navigation without modifying protected pages.
export function BusinessStructuredData({ original, corrected, paths }: {
  original: string;
  corrected: string;
  paths: string[];
}) {
  const path = usePathname();
  const useCorrection = path && !isProtectedSchemaPath(path) && paths.includes(schemaPath(path));
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: useCorrection ? corrected : original }} />;
}
