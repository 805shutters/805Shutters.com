"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { TechnicalMeasureEditor, TechnicalMeasureList } from "@/components/crm/TechnicalMeasureEditor";

function OfflineTechnicalMeasureContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pathId = pathname.match(/^\/crm\/technical-measures\/([^/]+)$/)?.[1];
  const formId = pathId && pathId !== "offline" ? pathId : searchParams.get("id");
  return formId ? <TechnicalMeasureEditor formId={formId} /> : <TechnicalMeasureList />;
}

export default function OfflineTechnicalMeasureShell() {
  return (
    <Suspense fallback={<main className="technical-measure-shell technical-measure-centered">Loading downloaded measures…</main>}>
      <OfflineTechnicalMeasureContent />
    </Suspense>
  );
}
