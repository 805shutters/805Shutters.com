/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import { queryKeys } from "@mts/lib/queryKeys";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { QUOTE_ACCOUNTS } from "@mts/lib/quoteConstants";
import { QuoteStatsBar, type StatsFilter } from "./QuoteStatsBar";
import { QuotesTable, type QuoteTableRow } from "./QuotesTable";
import { NewQuoteDialog, type NewQuoteData } from "./NewQuoteDialog";
import { ContractsSection } from "./ContractsSection";
import { QuotePortfolioDialog } from "./QuotePortfolioDialog";
import { Button } from "@mts/components/ui/button";
import { CalendarDays, Clock, ExternalLink, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ACCOUNT_IDS } from "@mts/lib/accounts";
import { STATUS_LABELS } from "@mts/lib/quoteStatus";
import { getCurrentQuoteSalesOwnerPatch } from "@mts/lib/quoteSalesOwnerSupabase";
import { getQuoteBuilderNote } from "@mts/lib/quoteTotals";
import { losAngelesDateString, losAngelesTimeString } from "@/lib/booking/availability";
import {
  filterCalendarAppointmentsForStatsTile,
  filterQuotesForStatsTile,
} from "@mts/lib/quoteDashboardFilters";
import {
  crmQuoteSourceSalesQuoteId,
  resolveCrmQuoteBuilderRoute,
} from "@mts/lib/quoteImportRouting";
import { formatSales805AppointmentTime, type Sales805Appointment } from "./sales805CalendarUtils";
import type { SalesQuote } from "@mts/types/quote";
import type { CrmCalendarEvent, CrmCustomer, CrmJob, CrmQuote } from "@/lib/crm/types";
import type { QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";
import {
  createQuoteV2Draft,
  listQuoteV2Records,
} from "@mts/lib/quoteV2ServerClient";

interface QuoteDashboardProps {
  quoteOperatorMode?: boolean;
  newQuoteRequest?: number;
  crmJobs?: CrmJob[];
  crmQuotes?: CrmQuote[];
  crmCalendarEvents?: CrmCalendarEvent[];
  crmCustomers?: CrmCustomer[];
  onChanged?: () => void;
  onOpenCrmCalendarDate?: (date: string) => void;
  onOpenCrmQuote?: (quoteId: string, tab?: QuoteWorkspaceOpenTab) => void;
}

type DashboardCalendarAppointment = {
  id: string;
  sourceId: string;
  sourceType: "sales_805" | "crm_calendar";
  salesAppointment?: Sales805Appointment;
  crmEventMeta?: Record<string, unknown> | null;
  quote_id: string | null;
  crm_quote_id?: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  appointment_date: string | null;
  start_time: string | null;
  assigned_to: string;
  status: string | null;
};

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

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? losAngelesDateString(date) : null;
}

function quoteBuilderTargetId(quote: QuoteTableRow): string | null {
  if (quote.source === "crm") return quote.sourceQuoteId || null;
  return quote.id;
}

function crmQuoteCustomerName(quote: CrmQuote, job?: CrmJob): string {
  return quote.customer_name || job?.customer_name || "—";
}

function metaString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" && item ? item : null;
}

function calendarEventSourceQuoteId(event: CrmCalendarEvent): string | null {
  return metaString(event.meta, "mts_quote_id") || metaString(event.meta, "sales_quote_id");
}

function isDashboardCrmCalendarEvent(event: CrmCalendarEvent): boolean {
  return event.event_type !== "block" && (event.status === "scheduled" || event.status === "rescheduled");
}

function crmCalendarAppointmentDate(event: CrmCalendarEvent): string | null {
  const date = new Date(event.start_at);
  return Number.isFinite(date.getTime()) ? losAngelesDateString(date) : null;
}

function crmCalendarAppointmentTime(event: CrmCalendarEvent): string | null {
  const date = new Date(event.start_at);
  return Number.isFinite(date.getTime()) ? losAngelesTimeString(date) : null;
}

function appointmentSortKey(appointment: DashboardCalendarAppointment): string {
  return `${appointment.appointment_date || "9999-12-31"}T${appointment.start_time || "99:99"}:${appointment.customer_name}`;
}

export function QuoteDashboard({
  quoteOperatorMode = false,
  newQuoteRequest = 0,
  crmJobs = [],
  crmQuotes = [],
  crmCalendarEvents = [],
  crmCustomers = [],
  onChanged,
  onOpenCrmCalendarDate,
  onOpenCrmQuote,
}: QuoteDashboardProps) {
  const {
    database: supabase,
    serverOwnedV2,
  } = useQuoteBuilderDatabase();
  const { activeAccountId, setAccountId, setActiveQuote, setActiveTab } = useQuoteBuilderStore();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<StatsFilter>("all");
  const [showNewQuoteDialog, setShowNewQuoteDialog] = useState(false);
  const [portfolioQuote, setPortfolioQuote] = useState<SalesQuote | null>(null);
  const [appointmentQuoteIds, setAppointmentQuoteIds] = useState<Record<string, string>>({});

  const visibleAccounts = quoteOperatorMode
    ? QUOTE_ACCOUNTS.filter((account) => account.id === ACCOUNT_IDS.SHUTTERS_805)
    : QUOTE_ACCOUNTS;
  const activeAccount = visibleAccounts.find((a) => a.id === activeAccountId) || visibleAccounts[0];

  useEffect(() => {
    if (!newQuoteRequest) return;
    setShowNewQuoteDialog(true);
  }, [newQuoteRequest]);

  // Fetch quotes for active account
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: queryKeys.salesQuotes.byAccount(activeAccountId),
    queryFn: async () => {
      if (serverOwnedV2 && activeAccountId === ACCOUNT_IDS.SHUTTERS_805) {
        return listQuoteV2Records(supabase);
      }
      const { data, error } = await (supabase as any)
        .from("sales_quotes")
        .select("*")
        .eq("account_id", activeAccountId)
        .is("deleted_at", null)
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

  const dashboardQuotes = useMemo<QuoteTableRow[]>(() => {
    const jobsById = new Map(crmJobs.map((job) => [job.id, job]));
    const localSalesQuoteIds = new Set(quotes.map((quote) => quote.id));
    const sourceSalesQuoteIds = new Set(
      crmQuotes
        .map((quote) => resolveCrmQuoteBuilderRoute(quote, localSalesQuoteIds))
        .filter((route) => route.kind === "v2")
        .map((route) => route.salesQuoteId)
    );

    const crmRows: QuoteTableRow[] = crmQuotes.map((quote) => {
      const job = jobsById.get(quote.job_id);
      const route = resolveCrmQuoteBuilderRoute(quote, localSalesQuoteIds);
      const sourceSystemQuoteId = crmQuoteSourceSalesQuoteId(quote);

      return {
        id: quote.id,
        status: quote.status,
        live_status: quote.live_status ?? null,
        quote_number: quote.quote_number || quote.quote_label || quote.id.slice(0, 8),
        customer_name: crmQuoteCustomerName(quote, job),
        customer_address: quote.customer_address || job?.address || null,
        generalJobNote: (quote.notes || "").trim() || null,
        appointment_date: dateOnly(job?.appointment_start),
        total_amount: quote.quote_total ?? job?.quote_total ?? job?.estimated_total ?? 0,
        sent_at: quote.sent_at,
        approved_at: quote.approved_at,
        sold_at: quote.sold_at,
        signed_at: quote.signed_at,
        ordered_at: quote.ordered_at,
        received_at: quote.received_at,
        installed_at: quote.installed_at,
        archived_at: quote.archived_at,
        customer_signature: quote.customer_signature,
        created_at: quote.created_at,
        updated_at: quote.updated_at,
        source: "crm",
        sourceQuoteId: route.kind === "v2" ? route.salesQuoteId : null,
        sourceSystemQuoteId,
        v2ImportStatus: route.kind === "v2" ? "ready" : "not_imported",
      };
    });

    const salesRows: QuoteTableRow[] = quotes
      .filter((quote) => !sourceSalesQuoteIds.has(quote.id))
      .map((quote) => ({
        ...quote,
        source: "sales" as const,
        sourceQuoteId: quote.id,
        salesQuote: quote,
        generalJobNote: getQuoteBuilderNote(quote) || null,
      }));

    return [...crmRows, ...salesRows].sort((a, b) => {
      const aTime = new Date(
        a.updated_at || a.created_at || "1970-01-01T00:00:00.000Z"
      ).getTime();
      const bTime = new Date(
        b.updated_at || b.created_at || "1970-01-01T00:00:00.000Z"
      ).getTime();
      return bTime - aTime;
    });
  }, [crmJobs, crmQuotes, quotes]);

  const dashboardCalendarAppointments = useMemo<DashboardCalendarAppointment[]>(() => {
    const crmQuoteIdsByJobId = new Map(
      crmQuotes
        .filter((quote) => quote.job_id)
        .map((quote) => [quote.job_id, quote.id] as const)
    );
    const importedSalesAppointmentIds = new Set(
      crmCalendarEvents
        .map((event) => metaString(event.meta, "mts_appointment_id"))
        .filter((id): id is string => Boolean(id))
    );

    const crmAppointments = crmCalendarEvents
      .filter(isDashboardCrmCalendarEvent)
      .map((event): DashboardCalendarAppointment => {
        const crmQuoteId = event.job_id ? crmQuoteIdsByJobId.get(event.job_id) || null : null;
        return {
          id: `crm:${event.id}`,
          sourceId: event.id,
          sourceType: "crm_calendar",
          quote_id: appointmentQuoteIds[`crm:${event.id}`] || crmQuoteId || calendarEventSourceQuoteId(event),
          crm_quote_id: crmQuoteId,
          crmEventMeta: event.meta || null,
          customer_name:
            event.customer_name || metaString(event.meta, "customer_name") || event.title || "Calendar appointment",
          customer_phone: event.customer_phone || metaString(event.meta, "customer_phone"),
          customer_email: event.customer_email || metaString(event.meta, "customer_email"),
          customer_address: event.customer_address || event.location,
          appointment_date: crmCalendarAppointmentDate(event),
          start_time: crmCalendarAppointmentTime(event),
          assigned_to: event.assigned_to || "Unassigned",
          status: event.status,
        };
      });

    const salesAppointments = sales805Appointments
      .filter((appointment) => !importedSalesAppointmentIds.has(appointment.id))
      .map((appointment): DashboardCalendarAppointment => ({
        id: `sales:${appointment.id}`,
        sourceId: appointment.id,
        sourceType: "sales_805",
        salesAppointment: appointment,
        quote_id: appointmentQuoteIds[`sales:${appointment.id}`] || appointment.quote_id,
        customer_name: appointment.customer_name,
        customer_phone: appointment.customer_phone,
        customer_email: null,
        customer_address: appointment.customer_address,
        appointment_date: appointment.appointment_date,
        start_time: appointment.start_time,
        assigned_to: appointment.assigned_to,
        status: appointment.status,
      }));

    return [...crmAppointments, ...salesAppointments].sort((left, right) =>
      appointmentSortKey(left).localeCompare(appointmentSortKey(right))
    );
  }, [appointmentQuoteIds, crmCalendarEvents, crmQuotes, sales805Appointments]);

  const filteredQuotes = useMemo(
    () => filterQuotesForStatsTile(dashboardQuotes, activeFilter, dashboardCalendarAppointments),
    [dashboardCalendarAppointments, dashboardQuotes, activeFilter]
  );
  const filteredQuoteIds = useMemo(
    () =>
      new Set(
        filteredQuotes.flatMap((quote) =>
          quote.sourceQuoteId ? [quote.id, quote.sourceQuoteId] : [quote.id]
        )
      ),
    [filteredQuotes]
  );
  const filteredDashboardCalendarAppointments = useMemo(
    () =>
      activeAccountId === ACCOUNT_IDS.SHUTTERS_805
        ? filterCalendarAppointmentsForStatsTile(
            dashboardCalendarAppointments,
            activeFilter,
            filteredQuoteIds
          )
        : [],
    [activeAccountId, activeFilter, dashboardCalendarAppointments, filteredQuoteIds]
  );
  // Create new quote
  const createQuote = useMutation({
    mutationFn: async (formData: NewQuoteData) => {
      const submittedAccountId = quoteOperatorMode ? ACCOUNT_IDS.SHUTTERS_805 : formData.accountId;
      if (serverOwnedV2) {
        if (submittedAccountId !== ACCOUNT_IDS.SHUTTERS_805) {
          throw new Error(
            "Authoritative Quote V2 currently creates 805 Shutters drafts only.",
          );
        }
        const created = await createQuoteV2Draft(supabase, {
          customerName: formData.customerName,
          customerPhone: formData.customerPhone || null,
          customerAddress: formData.customerAddress || null,
          customerEmail: formData.customerEmail || null,
        });
        return {
          quoteId: created.quoteId,
          quoteNumber: created.quoteNumber,
          accountId: ACCOUNT_IDS.SHUTTERS_805,
        };
      }
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
      const quote = data as SalesQuote;
      return {
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        accountId: quote.account_id,
      };
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      setAccountId(quote.accountId);
      setActiveQuote(quote.quoteId);
      setActiveTab("builder");
      setShowNewQuoteDialog(false);
      toast.success(`Quote ${quote.quoteNumber} created`);
    },
    onError: (error) => {
      toast.error("Failed to create quote: " + error.message);
    },
  });

  const createQuoteFromAppointment = useMutation({
    mutationFn: async (appointment: DashboardCalendarAppointment) => {
      if (appointment.quote_id) {
        return { quoteId: appointment.quote_id, created: false };
      }

      let quoteId: string;
      if (serverOwnedV2) {
        const created = await createQuoteV2Draft(supabase, {
          customerName: appointment.customer_name,
          customerPhone: appointment.customer_phone || null,
          customerEmail: appointment.customer_email || null,
          customerAddress: appointment.customer_address || null,
          appointmentDate: appointment.appointment_date,
        });
        quoteId = created.quoteId;
      } else {
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
            customer_email: appointment.customer_email || null,
            customer_address: appointment.customer_address || null,
            appointment_date: appointment.appointment_date,
            created_by: session?.session?.user?.id || null,
            ...(salesOwnerPatch || {}),
          })
          .select()
          .single();
        if (quoteError) throw quoteError;
        quoteId = quote.id as string;
      }

      const updateBuilder =
        appointment.sourceType === "sales_805"
          ? (supabase as any)
              .from("sales_805_appointments")
              .update({ quote_id: quoteId })
              .eq("id", appointment.sourceId)
          : (supabase as any)
              .from("crm_calendar_events")
              .update({
                meta: {
                  ...(appointment.crmEventMeta || {}),
                  mts_quote_id: quoteId,
                  sales_quote_id: quoteId,
                },
              })
              .eq("id", appointment.sourceId);

      const { error: appointmentError } = await updateBuilder;
      if (appointmentError) throw appointmentError;

      return { quoteId, created: true };
    },
    onSuccess: ({ quoteId, created }, appointment) => {
      setAppointmentQuoteIds((current) => ({ ...current, [appointment.id]: quoteId }));
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
      if (serverOwnedV2) {
        throw new Error(
          "Whole-quote copy is blocked until the server can preserve selected designs and authoritative price locks.",
        );
      }
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

  // Delete every quote type through authenticated server-owned routes.
  const deleteQuote = useMutation({
    mutationFn: async (quote: QuoteTableRow) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your CRM session expired. Sign in again and retry.");

      const path = quote.source === "crm"
        ? `/api/crm/quotes/${encodeURIComponent(quote.id)}`
        : `/api/crm/sales-quotes/${encodeURIComponent(quote.sourceQuoteId || quote.id)}`;
      const response = await fetch(path, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || "Quote could not be deleted.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      onChanged?.();
      toast.success("Quote deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete quote: " + error.message);
    },
  });

  const openQuoteRow = async (quote: QuoteTableRow, tab: QuoteWorkspaceOpenTab) => {
    const targetId = quoteBuilderTargetId(quote);
    if (targetId) {
      setActiveQuote(targetId);
      setActiveTab(tab);
      return;
    }
    if (quote.source === "crm") {
      onOpenCrmQuote?.(quote.id, tab);
    }
  };

  const handleOpenQuote = (quote: QuoteTableRow) => {
    openQuoteRow(quote, "builder");
  };

  const handleOpenDashboardAppointment = (appointment: DashboardCalendarAppointment) => {
    if (appointment.crm_quote_id) {
      onOpenCrmQuote?.(appointment.crm_quote_id, "builder");
      return;
    }

    if (appointment.quote_id) {
      if (!quotes.some((quote) => quote.id === appointment.quote_id)) {
        toast.error("This appointment points to a quote that is unavailable in V2.");
        return;
      }
      setAccountId(ACCOUNT_IDS.SHUTTERS_805);
      setActiveQuote(appointment.quote_id);
      setActiveTab("builder");
      return;
    }

    createQuoteFromAppointment.mutate(appointment);
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] min-w-0 space-y-4 p-4 sm:space-y-5 sm:p-5 xl:space-y-6 xl:p-6">
      {/* Stats Bar — status filter tabs */}
      <QuoteStatsBar
        quotes={dashboardQuotes}
        calendarAppointments={
          activeAccountId === ACCOUNT_IDS.SHUTTERS_805 ? dashboardCalendarAppointments : []
        }
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        theme={activeAccount.prefix === "805" ? "bw" : "blue"}
      />

      {filteredDashboardCalendarAppointments.length > 0 && (
        <Sales805AppointmentMatches
          appointments={filteredDashboardCalendarAppointments}
          isOpening={createQuoteFromAppointment.isPending}
          openingAppointmentId={
            createQuoteFromAppointment.variables ? `sales:${createQuoteFromAppointment.variables.id}` : null
          }
          onOpenAppointment={handleOpenDashboardAppointment}
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
        onPortfolio={(quote) => {
          if (quote.salesQuote) setPortfolioQuote(quote.salesQuote);
        }}
        onCopy={(id) => copyQuote.mutate(id)}
        onDelete={(quote) => deleteQuote.mutate(quote)}
        title={FILTER_LABELS[activeFilter]}
      />

      {/* Contracts Section */}
      <ContractsSection
        quotes={filteredQuotes}
        onOpenContract={(quote) => {
          openQuoteRow(quote, "contract");
        }}
      />

      {/* New Quote Dialog */}
      <NewQuoteDialog
        open={showNewQuoteDialog}
        onClose={() => setShowNewQuoteDialog(false)}
        onSubmit={(data) => createQuote.mutate(data)}
        isPending={createQuote.isPending}
        accountOptions={visibleAccounts}
        customers={crmCustomers}
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
  appointments: DashboardCalendarAppointment[];
  isOpening: boolean;
  openingAppointmentId: string | null;
  onOpenAppointment: (appointment: DashboardCalendarAppointment) => void;
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
          const actionLabel =
            appointment.quote_id || appointment.crm_quote_id
              ? "Open Quote"
              : isPending
                ? "Creating..."
                : "Create Quote";
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
                    {appointment.appointment_date ? formatAppointmentDate(appointment.appointment_date) : "Date TBD"}
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
                {actionLabel}
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
