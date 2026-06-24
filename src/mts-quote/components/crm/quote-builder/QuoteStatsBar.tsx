import { cn } from "@mts/lib/utils";
import { STATUS_ORDER, STATUS_LABELS } from "@mts/lib/quoteStatus";
import type { SalesQuote, QuoteStatus } from "@mts/types/quote";

export type StatsFilter = "all" | "today" | "upcoming" | QuoteStatus;

type Theme = "blue" | "bw";

export type QuoteStatsCalendarAppointment = {
  id: string;
  quote_id: string | null;
  appointment_date: string | null;
  status: string | null;
};

interface QuoteStatsBarProps {
  quotes: SalesQuote[];
  calendarAppointments?: QuoteStatsCalendarAppointment[];
  activeFilter: StatsFilter;
  onFilterChange: (filter: StatsFilter) => void;
  theme?: Theme;
}

export function QuoteStatsBar({
  quotes,
  calendarAppointments = [],
  activeFilter,
  onFilterChange,
  theme = "blue",
}: QuoteStatsBarProps) {
  const today = new Date().toISOString().split("T")[0];

  // Count per lifecycle status (archived excluded from default totals)
  const statusCounts: Record<QuoteStatus, number> = {
    draft: 0,
    sent: 0,
    sold: 0,
    ordered: 0,
    received: 0,
    installed: 0,
    archived: 0,
  };
  quotes.forEach((q) => {
    if (q.status in statusCounts) statusCounts[q.status as QuoteStatus]++;
  });

  const activeCalendarAppointments = calendarAppointments.filter(
    (appointment) => appointment.appointment_date && appointment.status !== "cancelled"
  );
  const calendarQuoteIds = new Set(
    activeCalendarAppointments
      .map((appointment) => appointment.quote_id)
      .filter((quoteId): quoteId is string => Boolean(quoteId))
  );
  const quoteAppointments = quotes.filter((quote) => !calendarQuoteIds.has(quote.id));

  const todayCount =
    quoteAppointments.filter((q) => q.appointment_date === today && q.status !== "archived")
      .length +
    activeCalendarAppointments.filter((appointment) => appointment.appointment_date === today)
      .length;
  const upcomingCount =
    quoteAppointments.filter(
      (q) =>
        q.appointment_date &&
        q.appointment_date >= today &&
        q.status !== "sold" &&
        q.status !== "installed" &&
        q.status !== "archived"
    ).length +
    activeCalendarAppointments.filter(
      (appointment) => appointment.appointment_date && appointment.appointment_date >= today
    ).length;

  const isBw = theme === "bw";

  // Lifecycle tiles — the file cabinet
  const lifecycleTiles: { key: StatsFilter; label: string; value: number }[] = STATUS_ORDER.map(
    (s) => ({
      key: s,
      label: STATUS_LABELS[s],
      value: statusCounts[s],
    })
  );

  // Meta filters shown first (at-a-glance calendar views)
  const metaTiles: { key: StatsFilter; label: string; value: number }[] = [
    { key: "today", label: "Today", value: todayCount },
    { key: "upcoming", label: "Upcoming", value: upcomingCount },
  ];

  return (
    <div className="space-y-4">
      {/* Meta filters (Today / Upcoming) */}
      <div className="flex gap-3 flex-wrap">
        {metaTiles.map((item) => (
          <FilterTile
            key={item.key}
            item={item}
            active={activeFilter === item.key}
            onClick={() => onFilterChange(activeFilter === item.key ? "all" : item.key)}
            isBw={isBw}
            variant="meta"
          />
        ))}

        <div className="w-px bg-black/10 mx-1 self-stretch" aria-hidden />

        {/* Lifecycle file cabinet */}
        {lifecycleTiles.map((item) => (
          <FilterTile
            key={item.key}
            item={item}
            active={activeFilter === item.key}
            onClick={() => onFilterChange(activeFilter === item.key ? "all" : item.key)}
            isBw={isBw}
            variant="lifecycle"
            status={item.key as QuoteStatus}
          />
        ))}
      </div>
    </div>
  );
}

// --- Tiles ---

const LIFECYCLE_TILE_BG: Record<QuoteStatus, string> = {
  draft: "bg-gray-100 hover:bg-gray-200 border-gray-200",
  sent: "bg-blue-100 hover:bg-blue-200 border-blue-200",
  sold: "bg-emerald-100 hover:bg-emerald-200 border-emerald-200",
  ordered: "bg-amber-100 hover:bg-amber-200 border-amber-200",
  received: "bg-cyan-100 hover:bg-cyan-200 border-cyan-200",
  installed: "bg-purple-100 hover:bg-purple-200 border-purple-200",
  archived: "bg-slate-100 hover:bg-slate-200 border-slate-200",
};

function FilterTile({
  item,
  active,
  onClick,
  isBw,
  variant,
  status,
}: {
  item: { key: StatsFilter; label: string; value: number };
  active: boolean;
  onClick: () => void;
  isBw: boolean;
  variant: "meta" | "lifecycle";
  status?: QuoteStatus;
}) {
  const activeClasses = isBw
    ? "bg-black !text-white border-2 border-black ring-2 ring-black/20"
    : "bg-[#0077b6] !text-white border-2 border-[#005f92] ring-2 ring-[#0077b6]/20";

  const inactiveClasses =
    variant === "lifecycle" && status
      ? cn(LIFECYCLE_TILE_BG[status], "border hover:shadow-md")
      : isBw
        ? "bg-white border border-[#d4d4d4] hover:border-black hover:shadow-md"
        : "bg-[#dbeafe] border border-[#93c5fd] hover:border-[#0077b6] hover:shadow-md";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center px-5 py-3 rounded-xl min-w-[96px] shadow-sm transition-all cursor-pointer text-black",
        active ? activeClasses : inactiveClasses
      )}
    >
      <span
        className={cn(
          "text-xs font-medium whitespace-nowrap",
          active ? "text-white/80" : "text-black/70"
        )}
      >
        {item.label}
      </span>
      <span className="text-2xl font-bold tabular-nums">{item.value}</span>
    </button>
  );
}
