import { quoteChargeSettingText, type QuoteChargeSettingView } from "@/lib/quote/live-lookup-presentation";

export function QuoteChargeSettingsPanel({ settings }: { settings: readonly QuoteChargeSettingView[] }) {
  const install = settings.find((row) => row.key === "install_per_unit");
  const ship = settings.find((row) => row.key === "ship_per_unit");
  return (
    <section aria-label="Install and shipping settings">
      <h1>Install and shipping</h1>
      <p>{quoteChargeSettingText(settings)}</p>
      <dl>
        <dt>Install per blind or shade unit</dt>
        <dd>{install ? install.amount.toFixed(2) : "Not available"}</dd>
        <dt>Shipping per blind or shade unit</dt>
        <dd>{ship ? ship.amount.toFixed(2) : "Not available"}</dd>
      </dl>
    </section>
  );
}
