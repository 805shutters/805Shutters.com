"use client";

import type { CrmClosedSalesReport, CrmClosedSalesWeek } from "@/lib/crm/types";

export function closedSalesCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function selectedClosedSalesWeek(report: CrmClosedSalesReport | undefined, start: string | null) {
  return report?.weeks.find(week => week.startDate === (start || report.latestWeekStart)) || report?.weeks[0];
}

export function ClosedSalesWeekSelector({ report, week, onChange }: {
  report: CrmClosedSalesReport; week: CrmClosedSalesWeek; onChange: (start: string | null) => void;
}) {
  return <label className="crm-closed-sales-selector">Week
    <select value={week.startDate} onChange={event => onChange(event.target.value === report.latestWeekStart ? null : event.target.value)}>
      {report.weeks.map(item => <option key={item.startDate} value={item.startDate}>{item.isCurrentWeek ? "This Week · " : ""}{item.label} · {closedSalesCurrency(item.totalCents)}</option>)}
    </select>
  </label>;
}

export function ClosedSalesCard({ report, selectedStart, unavailable, onChange, onOpen }: {
  report?: CrmClosedSalesReport; selectedStart: string | null; unavailable: boolean;
  onChange: (start: string | null) => void; onOpen: () => void;
}) {
  const week = selectedClosedSalesWeek(report, selectedStart);
  const index = report?.weeks.findIndex(item => item.startDate === week?.startDate) ?? -1;
  const valid = Boolean(week && !unavailable);
  const hasCurrentWeek = Boolean(report?.weeks[0]?.isCurrentWeek);
  const previousWeek = !week?.isCurrentWeek && index === (hasCurrentWeek ? 1 : 0);
  return <div className="crm-metric crm-closed-sales-card">
    <button type="button" className="crm-closed-sales-open" onClick={onOpen} disabled={!valid}>
      <span>Closed Sales{week?.isCurrentWeek ? " — This Week" : previousWeek ? " — Previous Week" : ""}</span>
      <strong>{valid ? closedSalesCurrency(week!.totalCents) : "Unavailable"}</strong>
      <small>{week?.label || "Monday through today"}</small>
      {report?.review.length ? <small className="crm-closed-sales-review">{report.review.length} signing record{report.review.length === 1 ? " needs" : "s need"} review</small> : null}
    </button>
    <div className="crm-closed-sales-nav" aria-label="Closed sales week navigation">
      <button type="button" aria-label="Earlier closed sales week" disabled={!valid || index + 1 >= (report?.weeks.length || 0)} onClick={() => onChange(report!.weeks[index + 1].startDate)}>← Earlier</button>
      <button type="button" aria-label={hasCurrentWeek ? "This week’s closed sales" : "Latest completed sales week"} disabled={!valid || index === 0} onClick={() => onChange(null)}>{hasCurrentWeek ? "This Week" : "Latest"}</button>
      <button type="button" aria-label="Later closed sales week" disabled={!valid || index <= 0} onClick={() => onChange(index === 1 ? null : report!.weeks[index - 1].startDate)}>Later →</button>
    </div>
  </div>;
}
