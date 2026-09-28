/** Catalog diagnostics describe automatic calculation, never manual-price eligibility. */
export function AutomaticPricingNotice({ issue }: { issue: string }) {
  return <div role="status" className="max-w-sm text-sm text-slate-700">
    <p>Automatic pricing is unavailable. Your custom price can still be saved and sent.</p>
    <details className="mt-1 text-xs text-muted-foreground">
      <summary>Automatic pricing details</summary>
      <p>{issue}</p>
    </details>
  </div>;
}
