/**
 * Centralized React Query key factory
 * Ensures consistent query key structure across the application
 * Helps with cache invalidation and query management
 */

export const queryKeys = {
  jobs: {
    all: ["jobs"] as const,
    lists: () => [...queryKeys.jobs.all, "list"] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.jobs.lists(), filters] as const,
    details: () => [...queryKeys.jobs.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.jobs.details(), id] as const,
    byStatus: (status: string) => [...queryKeys.jobs.lists(), { status }] as const,
    byAccount: (accountId: string) => [...queryKeys.jobs.lists(), { accountId }] as const,
  },
  schedule: {
    all: ["schedule"] as const,
    calendar: () => [...queryKeys.schedule.all, "calendar"] as const,
    technician: (installerId?: string) =>
      [...queryKeys.schedule.all, "technician", installerId] as const,
    portal: (accountId?: string) => [...queryKeys.schedule.all, "portal", accountId] as const,
  },
  accounts: {
    all: ["accounts"] as const,
    lists: () => [...queryKeys.accounts.all, "list"] as const,
    list: () => [...queryKeys.accounts.lists()] as const,
    details: () => [...queryKeys.accounts.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.accounts.details(), id] as const,
  },
  installers: {
    all: ["installers"] as const,
    lists: () => [...queryKeys.installers.all, "list"] as const,
    list: () => [...queryKeys.installers.lists()] as const,
    details: () => [...queryKeys.installers.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.installers.details(), id] as const,
  },
  contractors: {
    all: ["contractors"] as const,
    lists: () => [...queryKeys.contractors.all, "list"] as const,
    list: () => [...queryKeys.contractors.lists()] as const,
  },
  documents: {
    all: ["documents"] as const,
    byJob: (jobId: string) => [...queryKeys.documents.all, "job", jobId] as const,
    byType: (type: string) => [...queryKeys.documents.all, "type", type] as const,
  },
  communications: {
    all: ["communications"] as const,
    byJob: (jobId: string) => [...queryKeys.communications.all, "job", jobId] as const,
    unreadCounts: () => [...queryKeys.communications.all, "unread-counts"] as const,
  },
  invoices: {
    all: ["invoices"] as const,
    lists: () => [...queryKeys.invoices.all, "list"] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.invoices.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.invoices.all, "detail", id] as const,
  },
  workOrders: {
    all: ["work-orders"] as const,
    lists: () => [...queryKeys.workOrders.all, "list"] as const,
    detail: (id: string) => [...queryKeys.workOrders.all, "detail", id] as const,
  },
  quickbooks: {
    all: ["quickbooks"] as const,
    balances: () => [...queryKeys.quickbooks.all, "balances"] as const,
    items: (filters?: Record<string, unknown>) =>
      [...queryKeys.quickbooks.all, "items", filters] as const,
    syncMetadata: () => [...queryKeys.quickbooks.all, "sync-metadata"] as const,
  },
  threeDayBlinds: {
    all: ["three-day-blinds"] as const,
    paymentItems: () => [...queryKeys.threeDayBlinds.all, "payment-items"] as const,
    latestDocument: () => [...queryKeys.threeDayBlinds.all, "latest-document"] as const,
  },
  salesQuotes: {
    all: ["sales-quotes"] as const,
    lists: () => [...queryKeys.salesQuotes.all, "list"] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.salesQuotes.lists(), filters] as const,
    details: () => [...queryKeys.salesQuotes.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.salesQuotes.details(), id] as const,
    byAccount: (accountId: string) => [...queryKeys.salesQuotes.lists(), { accountId }] as const,
    byStatus: (status: string) => [...queryKeys.salesQuotes.lists(), { status }] as const,
    media: (quoteId: string) => [...queryKeys.salesQuotes.detail(quoteId), "media"] as const,
    bookkeepingQuotes: (accountIds?: readonly string[]) =>
      [...queryKeys.salesQuotes.all, "bookkeeping-quotes", accountIds] as const,
    bookkeepingEntries: (accountIds?: readonly string[]) =>
      [...queryKeys.salesQuotes.all, "bookkeeping-entries", accountIds] as const,
    bookkeepingPayments: (accountIds?: readonly string[]) =>
      [...queryKeys.salesQuotes.all, "bookkeeping-payments", accountIds] as const,
    bookkeepingCredits: (accountIds?: readonly string[]) =>
      [...queryKeys.salesQuotes.all, "bookkeeping-credits", accountIds] as const,
    bookkeepingInstallationInvoices: (accountIds?: readonly string[]) =>
      [...queryKeys.salesQuotes.all, "bookkeeping-installation-invoices", accountIds] as const,
    stats: (accountId: string) => [...queryKeys.salesQuotes.all, "stats", accountId] as const,
    orderAgentQueue: (accountId: string) =>
      [...queryKeys.salesQuotes.all, "order-agent-queue", accountId] as const,
  },
  portalUpdates: {
    all: ["portal-updates"] as const,
    latest: (jobId: string) => [...queryKeys.portalUpdates.all, "latest", jobId] as const,
  },
} as const;
