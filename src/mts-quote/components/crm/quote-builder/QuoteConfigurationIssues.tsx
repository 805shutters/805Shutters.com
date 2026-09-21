import type { ValidationIssue } from "@/lib/quote-v2/core";
import { quotePricingValidationIssues } from "@/lib/quote-v2/quote-pricing-policy";

/** Display fit checks without presenting them as missing quote prices. */
export function QuoteConfigurationIssues({ issues, gridOptionQuoting }: {
  issues: readonly ValidationIssue[];
  gridOptionQuoting: boolean;
}) {
  const displayed = gridOptionQuoting ? quotePricingValidationIssues(issues) : issues;
  const blockers = displayed.filter(issue => issue.severity === "hard_block");
  const notes = displayed.filter(issue => issue.severity !== "hard_block");
  return <>
    {blockers.length > 0 && <div role="alert" className="text-sm text-red-900">
      <p className="font-semibold">Pricing details needed</p>
      <ul className="list-disc pl-5">{blockers.map((issue, index) => <li key={`${issue.ruleId}-${index}`}>{issue.explanation}</li>)}</ul>
    </div>}
    {notes.length > 0 && <ul role="status" className="list-disc pl-5 text-sm text-slate-700">
      {notes.map((issue, index) => <li key={`${issue.ruleId}-${index}`}>{issue.explanation}</li>)}
    </ul>}
  </>;
}
