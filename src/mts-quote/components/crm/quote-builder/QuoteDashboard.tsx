/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { cn } from "@mts/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@mts/integrations/supabase/client";
import { queryKeys } from "@mts/lib/queryKeys";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { QUOTE_ACCOUNTS } from "@mts/lib/quoteConstants";
import { QuoteStatsBar, type StatsFilter } from "./QuoteStatsBar";
import { QuotesTable } from "./QuotesTable";
import { NewQuoteDialog, type NewQuoteData } from "./NewQuoteDialog";
import { ContractsSection } from "./ContractsSection";
import { QuotePortfolioDialog } from "./QuotePortfolioDialog";
import { Button } from "@mts/components/ui/button";
import { CalendarDays, Clock, ExternalLink, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ACCOUNT_IDS } from "@mts/lib/accounts";
import { STATUS_LABELS } from "@mts/lib/quoteStatus";
import { getCurrentQuoteSalesOwnerPatch } from "@mts/lib/quoteSalesOwnerSupabase";
import {
  filterCalendarAppointmentsForStatsTile,
  filterQuotesForStatsTile,
} from "@mts/lib/quoteDashboardFilters";
import { formatSales805AppointmentTime, type Sales805Appointment } from "./sales805CalendarUtils";
import type { SalesQuote } from "@mts/types/quote";

interface QuoteDashboardProps {
  quoteOperatorMode?: boolean;
}

const FILTER_LABELS: Record<StatsFilter, string> = {
  all: "All Quotes",
  today: "Today's Quotes",
  upcoming: "Upcoming Quotes",
  draft: `${STATUS_LABELS.draft} Quotes`,
  sent: `${STATUS_LABELS.sent} Quotes`,
  sold: `${STATUS_LABELS.sold} Quotes`,
  ordered: `${STATUS_LABELS.ordered} Quotes`,
  received: `${STATUS_LABELS.received} Quotes`,
  installed: `${STATUS_LABELS.installed} Quotes`,
  archived: `${STATUS_LABELS.archived} Quotes`,
};
const SALES_805_DASHBOARD_APPOINTMENTS_QUERY_KEY = [
  "sales-805-dashboard-appointments",
  ACCOUNT_IDS.SHUTTERS_805,
] as const;

export function QuoteDashboard({ quoteOperatorMode = false }: QuoteDashboardProps) {
  const { activeAccountId, setAccountId, setActiveQuote, setActiveTab } = useQuoteBuilderStore();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<StatsFilter>("all");
  const [showNewQuoteDialog, setShowNewQuoteDialog] = useState(false);
  const [portfolioQuote, setPortfolioQuote] = useState<SalesQuote | null>(null);

  const visibleAccounts = quoteOperatorMode
    ? QUOTE_ACCOUNTS.filter((account) => account.id === ACCOUNT_IDS.SHUTTERS_805)
    : QUOTE_ACCOUNTS;
  const activeAccount = visibleAccounts.find((a) => a.id === activeAccountId) || visibleAccounts[0];

  // Fetch quotes for active account
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: queryKeys.salesQuotes.byAccount(activeAccountId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_quotes")
        .select("*")
        .eq("account_id", activeAccountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SalesQuote[];
    },
  });

  const { data: sales805Appointments = [] } = useQuery({
    queryKey: SALES_805_DASHBOARD_APPOINTMENTS_QUERY_KEY,
    enabled: activeAccountId === ACCOUNT_IDS.SHUTTERS_805,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_805_appointments")
        .select(
          "id, quote_id, customer_name, customer_phone, customer_address, appointment_date, start_time, end_time, assigned_to, status, notes, source"
        )
        .eq("account_id", ACCOUNT_IDS.SHUTTERS_805)
        .neq("status", "cancelled")
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []) as Sales805Appointment[];
    },
  });

  const filteredQuotes = useMemo(
    () => filterQuotesForStatsTile(quotes, activeFilter, sales805Appointments),
    [quotes, activeFilter, sales805Appointments]
  );
  const filteredQuoteIds = useMemo(
    () => new Set(filteredQuotes.map((quote) => quote.id)),
    [filteredQuotes]
  );
  const filteredSales805Appointments = useMemo(
    () =>
      activeAccountId === ACCOUNT_IDS.SHUTTERS_805
        ? filterCalendarAppointmentsForStatsTile(
            sales805Appointments,
            activeFilter,
            filteredQuoteIds
          )
        : [],
    [activeAccountId, activeFilter, filteredQuoteIds, sales805Appointments]
  );
  // Create new quote
  const createQuote = useMutation({
    mutationFn: async (formData: NewQuoteData) => {
      const submittedAccountId = quoteOperatorMode ? ACCOUNT_IDS.SHUTTERS_805 : formData.accountId;
      const account = QUOTE_ACCOUNTS.find((a) => a.id === submittedAccountId) || QUOTE_ACCOUNTS[0];
      const { data: session } = await supabase.auth.getSession();
      const { data: quoteNumber, error: numError } = await (supabase as any).rpc(
        "next_quote_number",
        {
          account_prefix: account.prefix,
        }
      );
      if (numError) throw numError;
      const salesOwnerPatch =
        submittedAccountId === ACCOUNT_IDS.SHUTTERS_805
          ? await getCurrentQuoteSalesOwnerPatch()
          : null;

      const { data, error } = await (supabase as any)
        .from("sales_quotes")
        .insert({
          quote_number: quoteNumber,
          account_id: submittedAccountId,
          customer_name: formData.customerName,
          customer_phone: formData.customerPhone || null,
          customer_address: formData.customerAddress || null,
          customer_email: formData.customerEmail || null,
          created_by: session?.session?.user?.id || null,
          ...(salesOwnerPatch || {}),
        })
        .select()
        .single();
      if (error) throw error;
      return data as SalesQuote;
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      setAccountId(quote.account_id);
      setActiveQuote(quote.id);
      setActiveTab("builder");
      setShowNewQuoteDialog(false);
      toast.success(`Quote ${quote.quote_number} created`);
    },
    onError: (error) => {
      toast.error("Failed to create quote: " + error.message);
    },
  });

  const createQuoteFromAppointment = useMutation({
    mutationFn: async (appointment: Sales805Appointment) => {
      if (appointment.quote_id) {
        return { quoteId: appointment.quote_id, created: false };
      }

      const account = QUOTE_ACCOUNTS.find((a) => a.id === ACCOUNT_IDS.SHUTTERS_805);
      const { data: session } = await supabase.auth.getSession();
      const { data: quoteNumber, error: numError } = await (supabase as any).rpc(
        "next_quote_number",
        {
          account_prefix: account?.prefix || "805",
        }
      );
      if (numError) throw numError;
      const salesOwnerPatch = await getCurrentQuoteSalesOwnerPatch();

      const { data: quote, error: quoteError } = await (supabase as any)
        .from("sales_quotes")
        .insert({
          quote_number: quoteNumber,
          account_id: ACCOUNT_IDS.SHUTTERS_805,
          status: "draft",
          customer_name: appointment.customer_name,
          customer_phone: appointment.customer_phone || null,
          customer_address: appointment.customer_address || null,
          appointment_date: appointment.appointment_date,
          created_by: session?.session?.user?.id || null,
          ...(salesOwnerPatch || {}),
        })
        .select()
        .single();
      if (quoteError) throw quoteError;

      const { error: appointmentError } = await (supabase as any)
        .from("sales_805_appointments")
        .update({ quote_id: quote.id })
        .eq("id", appointment.id);
      if (appointmentError) throw appointmentError;

      return { quoteId: quote.id as string, created: true };
    },
    onSuccess: ({ quoteId, created }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      queryClient.invalidateQueries({ queryKey: SALES_805_DASHBOARD_APPOINTMENTS_QUERY_KEY });
      setAccountId(ACCOUNT_IDS.SHUTTERS_805);
      setActiveQuote(quoteId);
      setActiveTab("builder");
      toast.success(created ? "805 quote created from appointment" : "805 quote opened");
    },
    onError: (error) => {
      toast.error("Failed to open appointment quote: " + error.message);
    },
  });

  // Copy quote
  const copyQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      const { data: original, error: fetchErr } = await (supabase as any)
        .from("sales_quotes")
        .select("*")
        .eq("id", quoteId)
        .single();
      if (fetchErr) throw fetchErr;

      const { data: quoteNumber, error: numError } = await (supabase as any).rpc(
        "next_quote_number",
        {
          account_prefix: activeAccount.prefix,
        }
      );
      if (numError) throw numError;

      const { data: session } = await supabase.auth.getSession();
      const salesOwnerPatch =
        original.account_id === ACCOUNT_IDS.SHUTTERS_805
          ? await getCurrentQuoteSalesOwnerPatch()
          : null;

      const { data: newQuote, error: insertErr } = await (supabase as any)
        .from("sales_quotes")
        .insert({
          quote_number: quoteNumber,
          account_id: original.account_id,
          status: "draft",
          customer_name: original.customer_name,
          customer_email: original.customer_email,
          customer_phone: original.customer_phone,
          customer_address: original.customer_address,
          appointment_date: original.appointment_date,
          installer_notes: original.installer_notes,
          created_by: session?.session?.user?.id || null,
          ...(salesOwnerPatch || {}),
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      const { data: lineItems } = await (supabase as any)
        .from("sales_quote_line_items")
        .select("*")
        .eq("quote_id", quoteId);

      if (lineItems && lineItems.length > 0) {
        const newItems = lineItems.map((item: any) => ({
          quote_id: newQuote.id,
          room_name: item.room_name,
          product_type: item.product_type,
          width_whole: item.width_whole,
          width_fraction: item.width_fraction,
          height_whole: item.height_whole,
          height_fraction: item.height_fraction,
          quantity: item.quantity,
          sort_order: item.sort_order,
        }));
        await (supabase as any).from("sales_quote_line_items").insert(newItems);
      }

      return newQuote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      toast.success("Quote copied");
    },
  });

  // Delete quote
  const deleteQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await (supabase as any).from("sales_quotes").delete().eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      toast.success("Quote deleted");
    },
  });

  const handleOpenQuote = (quote: SalesQuote) => {
    setActiveQuote(quote.id);
    setActiveTab("builder");
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] min-w-0 space-y-4 p-4 sm:space-y-5 sm:p-5 xl:space-y-6 xl:p-6">
      {/* Header */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Quote Builder</h1>
          <p className="text-muted-foreground">Create and manage window treatment quotes</p>
        </div>
        <Button
          onClick={() => setShowNewQuoteDialog(true)}
          className="w-full bg-sky-500 text-white shadow-lg shadow-sky-500/25 hover:bg-sky-600 sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Quote
        </Button>
      </div>

      {/* Account Switcher */}
      <div className="flex flex-wrap gap-2">
        {visibleAccounts.map((account) => (
          <button
            key={account.id}
            onClick={() => {
              setAccountId(account.id);
              setActiveFilter("all");
            }}
            className={cn(
              "min-w-[min(160px,100%)] flex-1 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all sm:flex-none",
              activeAccountId === account.id
                ? account.prefix === "805"
                  ? "bg-black text-white border-2 border-black shadow-lg shadow-black/15"
                  : "bg-[#67645e] text-white border-2 border-[#4c4b46] shadow-lg shadow-[#67645e]/20"
                : "bg-white border border-[#d6d5cf] text-[#1c1c1a] hover:border-[#0b0b0b] hover:shadow-md"
            )}
          >
            {account.name}
          </button>
        ))}
      </div>

      {/* Stats Bar — status filter tabs */}
      <QuoteStatsBar
        quotes={quotes}
        calendarAppointments={
          activeAccountId === ACCOUNT_IDS.SHUTTERS_805 ? sales805Appointments : []
        }
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        theme={activeAccount.prefix === "805" ? "bw" : "blue"}
      />

      {filteredSales805Appointments.length > 0 && (
        <Sales805AppointmentMatches
          appointments={filteredSales805Appointments}
          isOpening={createQuoteFromAppointment.isPending}
          openingAppointmentId={createQuoteFromAppointment.variables?.id || null}
          onOpenAppointment={(appointment) => createQuoteFromAppointment.mutate(appointment)}
          title={
            activeFilter === "today"
              ? "Today's 805 Calendar Appointments"
              : "Upcoming 805 Calendar Appointments"
          }
        />
      )}

      {/* Quotes Table — secondary view: all quotes including drafts/sent/archived */}
      <QuotesTable
        quotes={filteredQuotes}
        isLoading={isLoading}
        onOpen={handleOpenQuote}
        onPortfolio={setPortfolioQuote}
        onCopy={(id) => copyQuote.mutate(id)}
        onDelete={(id) => deleteQuote.mutate(id)}
        title={FILTER_LABELS[activeFilter]}
      />

      {/* Contracts Section */}
      <ContractsSection
        quotes={filteredQuotes}
        onOpenContract={(quote) => {
          setActiveQuote(quote.id);
          setActiveTab("contract");
        }}
      />

      {/* New Quote Dialog */}
      <NewQuoteDialog
        open={showNewQuoteDialog}
        onClose={() => setShowNewQuoteDialog(false)}
        onSubmit={(data) => createQuote.mutate(data)}
        isPending={createQuote.isPending}
        accountOptions={visibleAccounts}
      />

      <QuotePortfolioDialog
        quote={portfolioQuote}
        open={!!portfolioQuote}
        onOpenChange={(open) => {
          if (!open) setPortfolioQuote(null);
        }}
      />
    </div>
  );
}

function Sales805AppointmentMatches({
  appointments,
  isOpening,
  openingAppointmentId,
  onOpenAppointment,
  title,
}: {
  appointments: Sales805Appointment[];
  isOpening: boolean;
  openingAppointmentId: string | null;
  onOpenAppointment: (appointment: Sales805Appointment) => void;
  title: string;
}) {
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {appointments.length} appointment{appointments.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="divide-y">
        {appointments.map((appointment) => {
          const isPending = isOpening && openingAppointmentId === appointment.id;
          return (
            <div
              key={appointment.id}
              className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-950">{appointment.customer_name}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {appointment.assigned_to}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" />
                    {formatAppointmentDate(appointment.appointment_date)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatSales805AppointmentTime(appointment.start_time)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-4 w-4" />
                    {appointment.customer_phone || "No phone"}
                  </span>
                </div>
                <p className="truncate text-sm text-slate-500">{appointment.customer_address}</p>
              </div>
              <Button
                variant="outline"
                className="shrink-0"
                disabled={isPending}
                onClick={() => onOpenAppointment(appointment)}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {appointment.quote_id ? "Open Quote" : isPending ? "Creating..." : "Create Quote"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatAppointmentDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
