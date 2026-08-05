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
export type CrmBookkeepingStatus = CrmQuoteStatus | "legacy" | "manual" | "closed";
export type CrmBookkeepingPaymentType = "zelle" | "cash" | "check" | "credit_card" | "venmo" | "other";
export type CrmBookkeepingEntrySource = "crm_quote" | "legacy_sheet" | "manual";
export type CrmBookkeepingPaymentSource = "crm_quote" | "legacy_sheet" | "manual";
export type CrmBookkeepingSalesOwner = "mike" | "jessica";
export type CrmCommissionRecipient = "mike" | "jessica";
export type CrmInstallationMatchStatus = "unmatched" | "matched" | "needs_review";

export type CrmJob = {
  id: string;
  created_at: string;
  updated_at: string;
  source: string;
  lead_id: string | null;
  lead_source?: string | null;
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
  meta?: Record<string, unknown> | null;
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
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  share_token: string | null;
  customer_signature: string | null;
  customer_printed_name: string | null;
  signed_at: string | null;
  quote_group_id: string | null;
  quote_label: string | null;
  meta: Record<string, unknown>;
  notes: string | null;
  customer_name?: string;
  live_status?: CrmBookkeepingStatus;
};

// ---- Quote builder: line items + designs (pick-one alternatives) ----

export type CrmQuoteSurchargeSelection = { id: string; units?: number };
export type CrmQuoteMotorizationSelection = {
  groupId: string;
  optionId: string;
  units?: number;
};
export type CrmQuoteDetailValue = string | number | boolean | null;

export type CrmQuoteDesign = {
  id: string;
  created_at: string;
  updated_at: string;
  line_item_id: string;
  label: string;
  sort_order: number;
  product_id: string;
  program_id: string | null;
  fabric: string | null;
  details: Record<string, CrmQuoteDetailValue>;
  surcharges: CrmQuoteSurchargeSelection[];
  motorization: CrmQuoteMotorizationSelection[];
  /** Server-computed per-window price (authoritative; clients never set this). */
  unit_price: number;
  /** Internal-only dealer/wholesale per-window cost when available. */
  wholesale_unit_price: number | null;
  /** Snapshot of the full pricing breakdown at priced_at. */
  price_breakdown: Record<string, unknown>;
  /** "ok" or a pricing engine error code (e.g. WIDTH_EXCEEDS_MAX). */
  price_status: string;
  priced_at: string | null;
  notes: string | null;
};

export type CrmQuoteLineItem = {
  id: string;
  created_at: string;
  updated_at: string;
  quote_id: string;
  room: string | null;
  width_in: number | null;
  height_in: number | null;
  quantity: number;
  /** Per-line discount percent (0-100) applied to this window's retail price. */
  discount_percent: number;
  sort_order: number;
  /** The customer's chosen alternative; only this design is billed. */
  selected_design_id: string | null;
  notes: string | null;
  designs: CrmQuoteDesign[];
};

export type CrmQuoteWithItems = CrmQuote & {
  lineItems: CrmQuoteLineItem[];
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
  meta?: Record<string, unknown> | null;
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
  installation_invoice_paid_at?: string | null;
  installation_invoice_paid_amount?: number | null;
  installation_invoice_payment_method?: string | null;
  installation_invoice_payment_notes?: string | null;
  installation_match_status: CrmInstallationMatchStatus;
  installation_matched_at: string | null;
  jessica_commission_paid_at: string | null;
  manufacturer_name: string | null;
  manufacturer_order_ref: string | null;
  manufacturer_order_url: string | null;
  manufacturer_document_url: string | null;
  notes: string | null;
  imported_sheet_row: number | null;
  ken_cut_override: number | null;
  meta?: Record<string, unknown> | null;
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
  external_source?: string | null;
  external_id?: string | null;
  meta?: Record<string, unknown> | null;
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

export type CrmJobExpenseCategory =
  | "materials"
  | "installation_extra"
  | "processing_fee"
  | "permit"
  | "repair"
  | "remake"
  | "referral"
  | "other";

export type CrmJobExpenseSource = "crm_quote" | "legacy_sheet" | "manual";

export type CrmJobExpense = {
  id: string;
  created_at: string;
  updated_at: string;
  bookkeeping_entry_id: string | null;
  quote_id: string | null;
  job_id: string | null;
  label: string;
  category: CrmJobExpenseCategory;
  amount: number;
  incurred_on: string | null;
  notes: string | null;
  source: CrmJobExpenseSource;
};

export type CrmInstallationInvoiceEmailStatus = "matched" | "needs_review" | "unmatched" | "skipped" | "error";

export type CrmInstallationInvoiceEmail = {
  id: string;
  created_at: string;
  updated_at: string;
  mailbox_email: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  gmail_history_id: string | null;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  sent_at: string | null;
  snippet: string | null;
  attachment_names: string[];
  email_url: string | null;
  extracted_customer_name: string | null;
  extracted_invoice_amount: number | null;
  extracted_invoice_number: string | null;
  installation_invoice_paid_at?: string | null;
  installation_invoice_paid_amount?: number | null;
  installation_invoice_payment_method?: string | null;
  installation_invoice_payment_notes?: string | null;
  extraction_confidence: number;
  matched_job_id: string | null;
  matched_quote_id: string | null;
  matched_bookkeeping_entry_id: string | null;
  match_status: CrmInstallationInvoiceEmailStatus;
  match_confidence: number;
  match_reason: string | null;
  processed_at: string | null;
  applied_at: string | null;
  error_message: string | null;
  raw: Record<string, unknown>;
};

export type CrmOrderCogsEmailStatus = "matched" | "needs_review" | "unmatched" | "skipped" | "error";

export type CrmOrderCogsEmail = {
  id: string;
  created_at: string;
  updated_at: string;
  mailbox_email: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  gmail_history_id: string | null;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  sent_at: string | null;
  snippet: string | null;
  attachment_names: string[];
  email_url: string | null;
  extracted_customer_name: string | null;
  extracted_order_amount: number | null;
  extracted_order_number: string | null;
  extraction_confidence: number;
  matched_job_id: string | null;
  matched_quote_id: string | null;
  matched_bookkeeping_entry_id: string | null;
  match_status: CrmOrderCogsEmailStatus;
  match_confidence: number;
  match_reason: string | null;
  processed_at: string | null;
  applied_at: string | null;
  error_message: string | null;
  raw: Record<string, unknown>;
};

export type CrmBookkeepingRow = {
  id: string;
  source: CrmBookkeepingEntrySource | "crm_quote";
  quoteId: string | null;
  /** Stable upstream quote ids recorded on the authoritative CRM quote. */
  quoteIdAliases?: string[];
  jobId: string | null;
  customerName: string;
  customerPhone: string | null;
  quoteNumber: string | null;
  soldDate: string | null;
  total: number;
  depositDue: number;
  depositPaid: number;
  depositPaymentType?: CrmBookkeepingPaymentType | null;
  balancePaid: number;
  balancePaymentType?: CrmBookkeepingPaymentType | null;
  paidTotal: number;
  creditIn: number;
  creditOut: number;
  paymentType: CrmBookkeepingPaymentType | null;
  cogs: number;
  balance: number;
  kenCut: number;
  kenCutOverride: number | null;
  advertisingReserve: number;
  mikeProfit: number;
  salesOwner: CrmBookkeepingSalesOwner | null;
  installationInvoiceDocumentId: string | null;
  installationInvoiceAmount: number;
  installationInvoiceNumber: string | null;
  installationInvoiceUrl: string | null;
  installationInvoicePaidAt: string | null;
  installationInvoicePaidAmount: number;
  installationInvoicePaymentMethod: string | null;
  installationInvoicePaymentNotes: string | null;
  installationInvoiceOpenAmount: number;
  isInstallationInvoicePaid: boolean;
  installationMatchStatus: CrmInstallationMatchStatus;
  installationMatchedAt: string | null;
  isInstallationComplete: boolean;
  // Work is done but no MTS installer invoice has been matched yet, so the
  // installation cost is unknown and Mike/Jessica payouts must not finalize.
  isMissingInstallerInvoice: boolean;
  remainingProfitBeforeJessica: number;
  jessicaCommission: number;
  jessicaCommissionPaidAt: string | null;
  jessicaCommissionOwed: number;
  isPaidInFull: boolean;
  manufacturerName: string | null;
  manufacturerOrderRef: string | null;
  manufacturerOrderUrl: string | null;
  manufacturerDocumentUrl: string | null;
  notes: string | null;
  status: CrmBookkeepingStatus;
  liveStatus?: CrmBookkeepingStatus;
  /** Authoritative CRM job status before payment-derived live-status projection. */
  jobStatus?: CrmJobStatus | null;
  payments: CrmBookkeepingPayment[];
  creditsIn: CrmBookkeepingCredit[];
  creditsOut: CrmBookkeepingCredit[];
  expenses: CrmJobExpense[];
  expensesTotal: number;
  remakeTotal: number;
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
  expensesTotal: number;
  remakeTotal: number;
  balance: number;
  kenCut: number;
  advertisingReserve: number;
  mikeProfit: number;
  installationAmount: number;
  jessicaCommission: number;
  jessicaCommissionPaid: number;
  jessicaCommissionOwed: number;
  closedRows: number;
  closedTotal: number;
  kenMonthlyDue: number;
  kenTotalClosed: number;
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
    | "missing_installer_invoice"
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
  meta?: Record<string, unknown> | null;
  customer_name?: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  product_interest?: string | null;
  customer_notes?: string | null;
  job_status?: CrmJobStatus | null;
  quote_sent_at?: string | null;
  quote_signed_at?: string | null;
  customer_contract_signed_at?: string | null;
};

export type CrmAvailabilitySlot = {
  id: string;
  created_at: string;
  updated_at: string;
  owner: string;
  start_at: string;
  end_at: string;
  status: "available" | "canceled";
  source: string;
  created_by_email: string | null;
  meta: Record<string, unknown>;
};

export type CrmSummary = {
  openJobs: number;
  scheduledJobs: number;
  quotedJobs: number;
  soldJobs: number;
  quotedPipeline: number;
  soldPipeline: number;
  depositCollected: number;
  openBalance: number;
  needsOrder: number;
  /** Sold jobs where the required deposit hasn't been collected (count). */
  depositNeeded: number;
  /** Total deposit still owed across deposit-needed jobs ($). */
  depositNeededAmount: number;
  /** Completed (installed/invoiced/closed) jobs with an unpaid balance (count). */
  balanceDueCompleted: number;
  /** Total unpaid balance across completed jobs ($). */
  balanceDueCompletedAmount: number;
  missingCogs: number;
  awaitingProduct: number;
  measureNeeded: number;
  measureScheduled: number;
};

export type CrmCommissionPayment = {
  id: string;
  created_at: string;
  updated_at: string;
  recipient: CrmCommissionRecipient;
  paid_on: string | null;
  period_month: string | null;
  amount: number;
  note: string | null;
  created_by_email: string | null;
  meta: Record<string, unknown>;
};

export type CrmPaymentPerson = "ken" | CrmCommissionRecipient;

export type CrmKenPaymentAllocation = {
  id: string;
  created_at: string;
  updated_at: string;
  payment_id: string;
  source: CrmBookkeepingRow["source"];
  quote_id: string | null;
  bookkeeping_entry_id: string | null;
  job_id: string | null;
  item_key: string;
  customer_name: string;
  closed_at: string | null;
  amount: number;
  period_month: string | null;
  meta: Record<string, unknown>;
};

export type CrmCommissionPaymentAllocation = {
  id: string;
  created_at: string;
  updated_at: string;
  payment_id: string;
  recipient: CrmCommissionRecipient;
  source: CrmBookkeepingRow["source"];
  quote_id: string | null;
  bookkeeping_entry_id: string | null;
  job_id: string | null;
  item_key: string;
  customer_name: string;
  closed_at: string | null;
  amount: number;
  period_month: string | null;
  meta: Record<string, unknown>;
};

export type CrmPartnerPaymentState = "unpaid" | "partial" | "paid";

export type CrmPartnerJobLedgerItem = {
  id: string;
  itemKey: string;
  person: Exclude<CrmPaymentPerson, "ken">;
  source: CrmBookkeepingRow["source"];
  quoteId: string | null;
  quoteIdAliases: string[];
  bookkeepingEntryId: string | null;
  jobId: string | null;
  customerName: string;
  quoteNumber: string | null;
  soldDate: string | null;
  closedAt: string | null;
  sourceStatus: CrmBookkeepingStatus;
  jobStatus: CrmJobStatus | null;
  displaySection: "completed" | "pipeline";
  total: number;
  advertisingReserve: number;
  cogs: number;
  kenCut: number;
  installationCost: number;
  expensesTotal: number;
  remakeTotal: number;
  remainingProfitBeforeJessica: number;
  mikeProfit: number;
  profitAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentState: CrmPartnerPaymentState;
  payableReady: boolean;
  holdReason: "job_not_completed" | "installer_invoice" | "no_profit" | null;
};

export type CrmPartnerPaymentLedgerItem = {
  id: string;
  itemKey: string;
  person: CrmPaymentPerson;
  source: CrmBookkeepingRow["source"];
  quoteId: string | null;
  quoteIdAliases: string[];
  bookkeepingEntryId: string | null;
  jobId: string | null;
  customerName: string;
  quoteNumber: string | null;
  closedAt: string | null;
  periodMonth: string | null;
  sourceStatus: CrmBookkeepingStatus;
  salesOwner: CrmBookkeepingSalesOwner | null;
  total: number;
  advertisingReserve: number;
  owedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentState: CrmPartnerPaymentState;
  explicitAllocationIds: string[];
  legacyPaidAmount: number;
};

export type CrmPartnerPaymentHistoryAllocation = {
  id: string;
  itemKey: string;
  customerName: string;
  quoteNumber: string | null;
  closedAt: string | null;
  total: number | null;
  amount: number;
  source: CrmBookkeepingRow["source"];
  quoteId: string | null;
  bookkeepingEntryId: string | null;
  jobId: string | null;
  virtual: boolean;
  resolution:
    | "exact_key"
    | "quote_id"
    | "bookkeeping_entry_id"
    | "job_id"
    | "unresolved_no_match"
    | "unresolved_ambiguous"
    | "unresolved_recipient";
  resolvedItemKey: string | null;
  unappliedAmount: number;
};

export type CrmPartnerPaymentHistoryBatch = {
  id: string;
  person: CrmPaymentPerson;
  source: "ken_payment" | "commission_payment";
  paidOn: string | null;
  periodMonth: string | null;
  amount: number;
  note: string | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  isLegacy: boolean;
  appliesToKenBuyout: boolean;
  isAdvance: boolean;
  advanceApplied: number;
  unappliedAmount: number;
  allocations: CrmPartnerPaymentHistoryAllocation[];
};

export type CrmKenBuyoutLedgerPayment = {
  id: string;
  paidOn: string | null;
  amount: number;
  note: string | null;
  createdByEmail: string | null;
  runningPaid: number;
  remainingBalance: number;
};

export type CrmKenBuyoutLedger = {
  target: number;
  totalPaid: number;
  remainingBalance: number;
  paidPct: number;
  paymentCount: number;
  payments: CrmKenBuyoutLedgerPayment[];
};

export type CrmPartnerPaymentLedgerPerson = {
  person: CrmPaymentPerson;
  label: string;
  earningsAccess: "visible" | "restricted";
  earned: number;
  paid: number;
  owed: number;
  advanceBalance: number;
  soldEarned: number;
  soldJobCount: number;
  allTimeJobSummary: {
    available: boolean;
    valueLabel: string;
    sold: { count: number; total: number };
    active: { count: number; total: number };
    closed: { count: number; total: number };
  };
  jobCount: number;
  activeJobCount: number;
  items: CrmPartnerPaymentLedgerItem[];
  activeItems: CrmPartnerPaymentLedgerItem[];
  jobItems: CrmPartnerJobLedgerItem[];
};

export type CrmPartnerPaymentLedger = {
  people: Record<CrmPaymentPerson, CrmPartnerPaymentLedgerPerson>;
  activeItems: CrmPartnerPaymentLedgerItem[];
  history: CrmPartnerPaymentHistoryBatch[];
  kenBuyout: CrmKenBuyoutLedger;
};

export type CrmCommissionMonthlySummary = {
  periodMonth: string;
  mikeEarned: number;
  mikePaid: number;
  mikeBalance: number;
  jessicaEarned: number;
  jessicaPaid: number;
  jessicaBalance: number;
};

export type CrmCommissionSummary = {
  monthly: CrmCommissionMonthlySummary[];
  totals: {
    mikeEarned: number;
    mikePaid: number;
    mikeOwed: number;
    jessicaEarned: number;
    jessicaPaid: number;
    jessicaOwed: number;
  };
};

export type CrmKenPayment = {
  id: string;
  created_at: string;
  updated_at: string;
  paid_on: string | null;
  period_month: string | null;
  amount: number;
  note: string | null;
  created_by_email: string | null;
  meta: Record<string, unknown>;
};

export type CrmKenPayoffSummary = {
  payoffTarget: number;
  openingBalance: number;
  recordedPayments: number;
  kenPaid: number;
  payoffRemaining: number;
  payoffPct: number;
  isPaidOff: boolean;
  kenAccruedCompleted: number;
  kenAccruedAll: number;
  kenOwed: number;
  completedJobs: number;
};

export type CrmVendorOrderTask = {
  recordId: string | null;
  taskId: string;
  formId: string | null;
  jobId: string;
  quoteId: string;
  customerName: string;
  quoteNumber: string | null;
  manufacturer: "Norman" | "Onyx" | "Lotus" | "Polar";
  productType: string;
  status: "needs_input" | "queued" | "processing" | "review_ready" | "failed";
  sourceKind: "signed_contract" | "submitted_technical_measure";
  submittedAt: string;
  message: string;
  routingKeys: string[];
  productNames: string[];
  lineCount: number;
  portalUrl: string | null;
  orderPacketUrl: string | null;
  manufacturerOrderRef: string | null;
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
  jobExpenses: CrmJobExpense[];
  installationInvoiceEmails: CrmInstallationInvoiceEmail[];
  orderCogsEmails: CrmOrderCogsEmail[];
  bookkeepingRows: CrmBookkeepingRow[];
  bookkeepingTotals: CrmBookkeepingTotals;
  kenPayments: CrmKenPayment[];
  kenPaymentAllocations: CrmKenPaymentAllocation[];
  kenPayoff: CrmKenPayoffSummary;
  commissionPayments: CrmCommissionPayment[];
  commissionPaymentAllocations: CrmCommissionPaymentAllocation[];
  commissionSummary: CrmCommissionSummary;
  partnerPaymentLedger: CrmPartnerPaymentLedger;
  accountability: CrmAccountabilityItem[];
  vendorOrderTasks: CrmVendorOrderTask[];
  summary: CrmSummary;
};
