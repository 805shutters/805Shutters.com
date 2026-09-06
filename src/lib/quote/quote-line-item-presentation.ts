import { quoteProductDetails, type QuoteProductDetail } from "@/lib/crm/customer-quote-details";

export type QuoteSpecificationGroup = {
  id: "finish" | "operation" | "construction" | "additional";
  title: string;
  details: QuoteProductDetail[];
};

const FINISH = /^(fabric(?: color)?|color|colour|material|finish|rail color|hinge color|light control|opacity|style)$/i;
const OPERATION = /(?:lift|tilt|mount|control|chain|cord|motor|remote|wand|operation)/i;
const CONSTRUCTION = /(?:shade type|cell|louver|slat|panel|frame|valance|cassette|fascia|track|divider|rail|shutter type|configuration)/i;

/** Presentation only: retain every saved customer-facing specification. */
export function quoteSpecificationGroups(styleName: string, options: string[]): QuoteSpecificationGroup[] {
  const details = quoteProductDetails(styleName, options, { illustrated: true });
  const fabricColor = details.find((detail) => /^fabric color$/i.test(detail.label));
  const groups: QuoteSpecificationGroup[] = [
    { id: "finish", title: details.some((d) => /^fabric/i.test(d.label)) ? "Fabric & finish" : "Material & finish", details: [] },
    { id: "operation", title: "Operation", details: [] },
    { id: "construction", title: "Construction", details: [] },
    { id: "additional", title: "Additional details", details: [] },
  ];
  for (const detail of details) {
    // Combine only exact duplicates; similar names can describe different selections.
    if (/^fabric$/i.test(detail.label) && fabricColor?.value.trim() === detail.value.trim()) continue;
    const index = FINISH.test(detail.label) ? 0 : OPERATION.test(detail.label) ? 1 : CONSTRUCTION.test(detail.label) ? 2 : 3;
    groups[index].details.push(detail);
  }
  return groups.filter((group) => group.details.length > 0);
}
