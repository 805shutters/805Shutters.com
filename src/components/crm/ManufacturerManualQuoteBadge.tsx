import { FileText } from "lucide-react";

/** Preserve exact supplier identity when a catalog family has no automatic price. */
export function ManufacturerManualQuoteBadge({ manufacturer }: { manufacturer: string }) {
  return <div role="status" className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-3 text-sm text-blue-950" data-testid="manual-quoting-only">
    <div className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4 shrink-0" /><span>QUOTE ONLY — {manufacturer} automation stopped.</span></div>
    <p className="mt-1">{manufacturer === "Sundance"
      ? "Sundance retail grids are imported. Current account factors, retail/net exceptions, and complete configuration rules require verification before automatic customer pricing."
      : `This selection is saved as an internal staff task. No ${manufacturer} price, customer-ready quote, status advance, order preparation, or manufacturer action is allowed from this request.`}</p>
  </div>;
}
