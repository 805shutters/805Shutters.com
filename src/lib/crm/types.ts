export const crmJobStatuses = [
  "new",
  "follow_up",
  "scheduled",
  "quoted",
  "sold",
  "ordered",
  "installed",
  "invoiced",
  "closed",
  "lost"
] as const;

export const crmQuoteStatuses = [
  "draft",
  "sent",
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
  "archived",
  "lost"
] as const;

export type CrmJobStatus = (typeof crmJobStatuses)[number];
export type CrmQuoteStatus = (typeof crmQuoteStatuses)[number];
export type CrmBookkeepingPaymentType = "zelle" | "cash" | "check" | "credit_card" | "other";
export type CrmBookkeepingEntrySource = "crm_quote" | "legacy_sheet" | "manual";
export type CrmBookkeepingPaymentSource = "crm_quote" | "legacy_sheet" | "manual";
export type CrmBookkeepingSalesOwner = "mike" | "jessica";
export type CrmInstallationMatchStatus = "unmatched" | "matched" | "needs_review";

export type CrmJob = {
  id: string;
  created_at: string;
  updated_at: string;
  source: string;
  lead_id: string | null;
  status: CrmJobStatus;
  priority: "low" | "normal" | "high" | "urgent";
  customer_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  product_interest: string;
  sales_owner: string;
  next_action: string | null;
  next_action_due: string | null;
  appointment_start: string | null;
  appointment_end: string | null;
  estimated_total: number;
  deposit_paid: number;
  notes: string | null;
  quote_total?: number;
};

export type CrmQuote = {
  id: string;
  created_at: string;
  updated_at: string;
  job_id: string;
  quote_number: string | null;
  status: CrmQuoteStatus;
  quote_total: number;
  materials_cost: number;
  labor_cost: number;
  discount: number;
  tax: number;
  deposit_required: number;
  balance_due: number;
  sold_by: string | null;
  sent_at: string | null;
  approved_at: string | null;
  sold_at: string | null;
  ordered_at: string | null;
  received_at: string | null;
  installed_at: string | null;
  archived_at: string | null;
  manufacturer_name: string | null;
  manufacturer_order_ref: string | null;
  manufacturer_order_url: string | null;
  manufacturer_document_url: string | null;
  notes: string | null;
  customer_name?: string;
};

export type CrmCustomer = {
  id: string;
  created_at: string;
  updated_at: string;
  source: "crm" | "bookkeeping_import" | "manual";
  display_name: string;
  normalized_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  first_sold_date: string | null;
  latest_sold_date: string | null;
  latest_status: string | null;
  lifetime_value: number;
  open_balance: number;
  notes: string | null;
};

export type CrmCustomerProduct = {
  id: string;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  job_id: string | null;
  quote_id: string | null;
  bookkeeping_entry_id: string | null;
  room: string | null;
  product_type: string;
  description: string | null;
  width: string | null;
  height: string | null;
  quantity: number;
  supplier: string | null;
  material: string | null;
  fabric: string | null;
  color: string | null;
  control_type: string | null;
  mount_type: string | null;
  unit_price: number;
  total_price: number;
  status: string | null;
  meta: Record<string, unknown>;
};

export type CrmCustomerContract = {
  id: string;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  job_id: string | null;
  quote_id: string | null;
  bookkeeping_entry_id: string | null;
  title: string;
  contract_url: string | null;
  share_token: string | null;
  status: string | null;
  signed_at: string | null;
  total_amount: number;
  meta: Record<string, unknown>;
};

export type CrmBookkeepingEntry = {
  id: string;
  created_at: string;
  updated_at: string;
  quote_id: string | null;
  job_id: string | null;
  source: CrmBookkeepingEntrySource;
  customer_name: string;
  sold_date: string | null;
  total_amount: number;
  payment_type: CrmBookkeepingPaymentType | null;
  cogs_amount: number;
  sales_owner: CrmBookkeepingSalesOwner | null;
  sales_owner_auth_user_id: string | null;
  sales_owner_set_at: string | null;
  installation_invoice_document_id: string | null;
  installation_invoice_amount: number;
  installation_invoice_number: string | null;
  installation_invoice_url: string | null;
  installation_match_status: CrmInstallationMatchStatus;
  installation_matched_at: string | null;
  jessica_commission_paid_at: string | null;
  manufacturer_name: string | null;
  manufacturer_order_ref: string | null;
  manufacturer_order_url: string | null;
  manufacturer_document_url: string | null;
  notes: string | null;
  imported_sheet_row: number | null;
};

export type CrmBookkeepingPayment = {
  id: string;
  created_at: string;
  updated_at: string;
  quote_id: string | null;
  job_id: string | null;
  bookkeeping_entry_id: string | null;
  payment_label: string;
  payment_type: CrmBookkeepingPaymentType;
  amount: number;
  paid_at: string | null;
  notes: string | null;
  source: CrmBookkeepingPaymentSource;
};

export type CrmBookkeepingCredit = {
  id: string;
  created_at: string;
  updated_at: string;
  from_quote_id: string | null;
  from_bookkeeping_entry_id: string | null;
  to_quote_id: string | null;
  to_bookkeeping_entry_id: string | null;
  amount: number;
  credit_date: string | null;
  note: string | null;
};

export type CrmBookkeepingRow = {
  id: string;
  source: CrmBookkeepingEntrySource | "crm_quote";
  quoteId: string | null;
  jobId: string | null;
  customerName: string;
  quoteNumber: string | null;
  soldDate: string | null;
  total: number;
  depositDue: number;
  depositPaid: number;
  balancePaid: number;
  paidTotal: number;
  creditIn: number;
  creditOut: number;
  paymentType: CrmBookkeepingPaymentType | null;
  cogs: number;
  balance: number;
  kenCut: number;
  mikeProfit: number;
  salesOwner: CrmBookkeepingSalesOwner | null;
  installationInvoiceDocumentId: string | null;
  installationInvoiceAmount: number;
  installationInvoiceNumber: string | null;
  installationInvoiceUrl: string | null;
  installationMatchStatus: CrmInstallationMatchStatus;
  installationMatchedAt: string | null;
  isInstallationComplete: boolean;
  remainingProfitBeforeJessica: number;
  jessicaCommission: number;
  jessicaCommissionPaidAt: string | null;
  jessicaCommissionOwed: number;
  manufacturerName: string | null;
  manufacturerOrderRef: string | null;
  manufacturerOrderUrl: string | null;
  manufacturerDocumentUrl: string | null;
  notes: string | null;
  status: CrmQuoteStatus | "legacy" | "manual";
  payments: CrmBookkeepingPayment[];
  creditsIn: CrmBookkeepingCredit[];
  creditsOut: CrmBookkeepingCredit[];
};

export type CrmCustomerFile = {
  id: string;
  customer: CrmCustomer | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  latestStatus: string | null;
  latestSoldDate: string | null;
  lifetimeValue: number;
  openBalance: number;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  bookkeepingRows: CrmBookkeepingRow[];
  products: CrmCustomerProduct[];
  contracts: CrmCustomerContract[];
  notes: string[];
};

export type CrmBookkeepingTotals = {
  rows: number;
  total: number;
  paidTotal: number;
  creditIn: number;
  creditOut: number;
  cogs: number;
  balance: number;
  kenCut: number;
  mikeProfit: number;
  installationAmount: number;
  jessicaCommission: number;
  jessicaCommissionPaid: number;
  jessicaCommissionOwed: number;
  missingCogs: number;
};

export type CrmAccountabilityItem = {
  id: string;
  type:
    | "needs_order"
    | "missing_cogs"
    | "payment_due"
    | "awaiting_product"
    | "ready_to_install"
    | "commission_due";
  label: string;
  detail: string;
  owner: string;
  urgency: "normal" | "warning" | "urgent" | "complete";
  amount?: number;
  rowId?: string;
  quoteId?: string | null;
  jobId?: string | null;
};

export type CrmCalendarEvent = {
  id: string;
  created_at: string;
  updated_at: string;
  job_id: string | null;
  title: string;
  event_type: "sales_consult" | "measure" | "install" | "follow_up" | "block";
  status: "scheduled" | "complete" | "canceled" | "rescheduled";
  assigned_to: string;
  start_at: string;
  end_at: string;
  location: string | null;
  notes: string | null;
  customer_name?: string;
};

export type CrmSummary = {
  openJobs: number;
  scheduledJobs: number;
  quotedJobs: number;
  soldJobs: number;
  quotePipeline: number;
  depositCollected: number;
  openBalance: number;
  needsOrder: number;
  missingCogs: number;
  readyToInstall: number;
  customerFiles: number;
  contracts: number;
};

export type CrmDashboardData = {
  jobs: CrmJob[];
  quotes: CrmQuote[];
  events: CrmCalendarEvent[];
  customers: CrmCustomer[];
  customerProducts: CrmCustomerProduct[];
  customerContracts: CrmCustomerContract[];
  customerFiles: CrmCustomerFile[];
  bookkeepingEntries: CrmBookkeepingEntry[];
  bookkeepingPayments: CrmBookkeepingPayment[];
  bookkeepingCredits: CrmBookkeepingCredit[];
  bookkeepingRows: CrmBookkeepingRow[];
  bookkeepingTotals: CrmBookkeepingTotals;
  accountability: CrmAccountabilityItem[];
  summary: CrmSummary;
};
