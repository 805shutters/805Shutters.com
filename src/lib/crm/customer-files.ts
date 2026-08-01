import {
  CrmBookkeepingRow,
  CrmCustomer,
  CrmCustomerContract,
  CrmCustomerFile,
  CrmCustomerProduct,
  CrmJob,
  CrmJobStatus,
  CrmQuote
} from "@/lib/crm/types";
import { effectiveBookkeepingStatus } from "@/lib/crm/bookkeeping";

// Jobs the customer actually bought — quoted/lost jobs must not count as money
// owed or lifetime value.
const soldLifecycleJobStatuses = new Set<CrmJobStatus>(["sold", "ordered", "installed", "invoiced", "closed"]);
// Closed jobs are settled; an estimated_total minus deposit on them is not a
// collectible balance.
const openBalanceJobStatuses = new Set<CrmJobStatus>(["sold", "ordered", "installed", "invoiced"]);

export function buildCustomerFiles({
  customers,
  products,
  contracts,
  jobs,
  quotes,
  bookkeepingRows
}: {
  customers: CrmCustomer[];
  products: CrmCustomerProduct[];
  contracts: CrmCustomerContract[];
  jobs: CrmJob[];
  quotes: CrmQuote[];
  bookkeepingRows: CrmBookkeepingRow[];
}): CrmCustomerFile[] {
  const activeCustomers = customers.filter((customer) => !hasDeleteTombstone(customer.meta));
  const activeJobs = jobs.filter((job) => !hasDeleteTombstone(job.meta));
  const activeQuotes = quotes.filter((quote) => !hasDeleteTombstone(quote.meta));
  const activeProducts = products.filter((product) => !hasDeleteTombstone(product.meta));
  const activeContracts = contracts.filter((contract) => !hasDeleteTombstone(contract.meta));
  const jobById = new Map(activeJobs.map((job) => [job.id, job]));
  const quoteById = new Map(activeQuotes.map((quote) => [quote.id, quote]));
  const fileMap = new Map<string, CrmCustomerFile>();
  // Imported crm_customers totals are point-in-time snapshots. They only apply
  // when a file has no live ledger rows or sold jobs — otherwise they would
  // double-count the same sales (and miss payments recorded since the import).
  const snapshotTotals = new Map<CrmCustomerFile, { lifetimeValue: number; openBalance: number }>();
  const filesWithSoldJobFinancials = new Set<CrmCustomerFile>();

  for (const customer of activeCustomers) {
    const file: CrmCustomerFile = {
      id: customer.id,
      customer,
      customerName: customer.display_name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      latestStatus: customer.latest_status,
      latestSoldDate: customer.latest_sold_date,
      lifetimeValue: 0,
      openBalance: 0,
      jobs: [],
      quotes: [],
      bookkeepingRows: [],
      products: [],
      contracts: [],
      notes: customer.notes ? [customer.notes] : []
    };
    snapshotTotals.set(file, {
      lifetimeValue: Number(customer.lifetime_value) || 0,
      openBalance: Number(customer.open_balance) || 0
    });
    fileMap.set(customerKey(customer.normalized_name || customer.display_name), file);
  }

  for (const row of bookkeepingRows) {
    const key = customerKey(row.customerName);
    const file = ensureFile(fileMap, key, row.customerName);
    file.bookkeepingRows.push(row);
    file.lifetimeValue += Number(row.total) || 0;
    file.openBalance += Math.max(Number(row.balance) || 0, 0);
    file.phone ||= row.customerPhone;
    file.latestStatus = effectiveBookkeepingStatus(row);
    file.latestSoldDate = newestDate(file.latestSoldDate, row.soldDate);
    if (row.notes) file.notes.push(row.notes);

    if (row.jobId) {
      const job = jobById.get(row.jobId);
      if (job) pushUnique(file.jobs, job.id, job);
    }

    if (row.quoteId) {
      const quote = quoteById.get(row.quoteId);
      if (quote) pushUnique(file.quotes, quote.id, quote);
    }

    const rowContractUrl = row.manufacturerDocumentUrl || row.manufacturerOrderUrl || null;
    if (rowContractUrl) {
      pushUnique(file.contracts, `row-contract-${row.id}`, {
        id: `row-contract-${row.id}`,
        created_at: "",
        updated_at: "",
        customer_id: file.customer?.id || null,
        job_id: row.jobId,
        quote_id: row.quoteId,
        bookkeeping_entry_id: row.source === "crm_quote" ? null : row.id,
        title: row.manufacturerOrderRef || `${row.customerName} document`,
        contract_url: rowContractUrl,
        share_token: null,
        status: String(effectiveBookkeepingStatus(row)),
        signed_at: null,
        total_amount: row.total,
        meta: { source: "bookkeeping_row" }
      });
    }
  }

  for (const job of activeJobs) {
    const key = customerKey(job.customer_name);
    const file = ensureFile(fileMap, key, job.customer_name);
    pushUnique(file.jobs, job.id, job);
    file.phone ||= job.phone;
    file.email ||= job.email;
    file.address ||= job.address;
    file.city ||= job.city;
    file.latestStatus ||= job.status;
    const hasLedgerRowForJob = file.bookkeepingRows.some((row) => row.jobId === job.id);
    if (!hasLedgerRowForJob && soldLifecycleJobStatuses.has(job.status)) {
      if (openBalanceJobStatuses.has(job.status)) {
        file.openBalance += Math.max(0, Number(job.estimated_total || 0) - Number(job.deposit_paid || 0));
      }
      file.lifetimeValue += Number(job.estimated_total) || 0;
      filesWithSoldJobFinancials.add(file);
    }
    file.latestSoldDate = newestDate(file.latestSoldDate, job.appointment_start || job.created_at);
    if (job.notes) file.notes.push(job.notes);
  }

  for (const quote of activeQuotes) {
    const job = jobById.get(quote.job_id);
    const key = customerKey(quote.customer_name || job?.customer_name || "");
    const file = ensureFile(fileMap, key, quote.customer_name || job?.customer_name || "Linked customer");
    pushUnique(file.quotes, quote.id, quote);
    if (job) pushUnique(file.jobs, job.id, job);
    file.phone ||= quote.customer_phone || job?.phone || null;
    if (!file.bookkeepingRows.length) file.latestStatus = quote.live_status || quote.status;
    file.latestSoldDate = newestDate(file.latestSoldDate, quote.sold_at || quote.approved_at || quote.created_at);
    if (quote.notes) file.notes.push(quote.notes);
  }

  for (const product of activeProducts) {
    const key = product.customer_id
      ? customerKey(activeCustomers.find((customer) => customer.id === product.customer_id)?.normalized_name || "")
      : relatedFileKey(product, jobById, quoteById);
    const file = key ? ensureFile(fileMap, key, fallbackRelatedName(product, jobById, quoteById)) : null;
    if (file) pushUnique(file.products, product.id, product);
  }

  for (const contract of activeContracts) {
    const key = contract.customer_id
      ? customerKey(activeCustomers.find((customer) => customer.id === contract.customer_id)?.normalized_name || "")
      : relatedFileKey(contract, jobById, quoteById);
    const file = key ? ensureFile(fileMap, key, fallbackRelatedName(contract, jobById, quoteById)) : null;
    if (file) {
      pushUnique(file.contracts, contract.id, contract);
      file.latestSoldDate = newestDate(file.latestSoldDate, contract.signed_at);
    }
  }

  for (const file of fileMap.values()) {
    const latestJob = newestByDate(file.jobs, (job) => job.updated_at || job.created_at);
    if (latestJob?.phone) file.phone = latestJob.phone;

    const snapshot = snapshotTotals.get(file);
    if (snapshot && !file.bookkeepingRows.length && !filesWithSoldJobFinancials.has(file)) {
      file.lifetimeValue = snapshot.lifetimeValue;
      file.openBalance = snapshot.openBalance;
    }

    if (!file.products.length) {
      for (const job of file.jobs) {
        pushUnique(file.products, `job-product-${job.id}`, {
          id: `job-product-${job.id}`,
          created_at: job.created_at,
          updated_at: job.updated_at,
          customer_id: file.customer?.id || null,
          job_id: job.id,
          quote_id: null,
          bookkeeping_entry_id: null,
          room: null,
          product_type: job.product_interest || "Window Treatments",
          description: job.notes || job.next_action || null,
          width: null,
          height: null,
          quantity: 1,
          supplier: null,
          material: null,
          fabric: null,
          color: null,
          control_type: null,
          mount_type: null,
          unit_price: Number(job.estimated_total) || 0,
          total_price: Number(job.estimated_total) || 0,
          status: job.status,
          meta: { source: "crm_job" }
        });
      }
    }

    file.notes = Array.from(new Set(file.notes.filter(Boolean)));
    const liveStatus = latestLiveStatus(file);
    if (liveStatus) file.latestStatus = liveStatus;
  }

  return Array.from(fileMap.values()).sort((a, b) => {
    const at = a.latestSoldDate ? Date.parse(a.latestSoldDate) : 0;
    const bt = b.latestSoldDate ? Date.parse(b.latestSoldDate) : 0;
    return bt - at || a.customerName.localeCompare(b.customerName);
  });
}

function hasDeleteTombstone(meta: Record<string, unknown> | null | undefined) {
  return Boolean(meta && typeof meta === "object" && !Array.isArray(meta) && meta.deleted_at);
}

function latestLiveStatus(file: CrmCustomerFile) {
  const latestRow = newestByDate(file.bookkeepingRows, (row) => row.soldDate);
  if (latestRow) return effectiveBookkeepingStatus(latestRow);

  const latestSignedContract = newestByDate(
    file.contracts.filter((contract) => contract.signed_at),
    (contract) => contract.signed_at
  );

  const latestQuote = newestByDate(file.quotes, (quote) =>
    quote.signed_at || quote.sold_at || quote.approved_at || quote.ordered_at || quote.received_at || quote.installed_at || quote.created_at
  );
  if (latestQuote) {
    const quoteStatus = latestQuote.live_status || latestQuote.status;
    if (latestSignedContract && (quoteStatus === "draft" || quoteStatus === "sent")) return signedContractStatus(latestSignedContract);
    return quoteStatus;
  }

  if (latestSignedContract) return signedContractStatus(latestSignedContract);

  const latestJob = newestByDate(file.jobs, (job) => job.appointment_start || job.created_at);
  if (latestJob) return latestJob.status;

  return file.latestStatus;
}

function signedContractStatus(contract: CrmCustomerContract) {
  if (!contract.status || contract.status === "draft" || contract.status === "sent") return "sold";
  return contract.status;
}

function newestByDate<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  let newest: T | null = null;
  let newestTime = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const date = getDate(item);
    const parsedTime = date ? Date.parse(date) : Number.NEGATIVE_INFINITY;
    const time = Number.isFinite(parsedTime) ? parsedTime : Number.NEGATIVE_INFINITY;
    if (!newest || time > newestTime) {
      newest = item;
      newestTime = time;
    }
  }
  return newest;
}

export function customerKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ensureFile(fileMap: Map<string, CrmCustomerFile>, key: string, customerName: string) {
  const normalizedKey = key || customerKey(customerName) || "unknown";
  const existing = fileMap.get(normalizedKey);
  if (existing) return existing;

  const file: CrmCustomerFile = {
    id: `customer-file-${normalizedKey.replace(/\s+/g, "-")}`,
    customer: null,
    customerName: customerName || "Unknown customer",
    phone: null,
    email: null,
    address: null,
    city: null,
    latestStatus: null,
    latestSoldDate: null,
    lifetimeValue: 0,
    openBalance: 0,
    jobs: [],
    quotes: [],
    bookkeepingRows: [],
    products: [],
    contracts: [],
    notes: []
  };
  fileMap.set(normalizedKey, file);
  return file;
}

function relatedFileKey(
  record: { job_id: string | null; quote_id: string | null },
  jobById: Map<string, CrmJob>,
  quoteById: Map<string, CrmQuote>
) {
  if (record.job_id) {
    const job = jobById.get(record.job_id);
    if (job) return customerKey(job.customer_name);
  }
  if (record.quote_id) {
    const quote = quoteById.get(record.quote_id);
    if (quote?.customer_name) return customerKey(quote.customer_name);
    if (quote?.job_id) {
      const job = jobById.get(quote.job_id);
      if (job) return customerKey(job.customer_name);
    }
  }
  return "";
}

function fallbackRelatedName(
  record: { job_id: string | null; quote_id: string | null },
  jobById: Map<string, CrmJob>,
  quoteById: Map<string, CrmQuote>
) {
  if (record.job_id) {
    const job = jobById.get(record.job_id);
    if (job) return job.customer_name;
  }
  if (record.quote_id) {
    const quote = quoteById.get(record.quote_id);
    if (quote?.customer_name) return quote.customer_name;
    const job = quote?.job_id ? jobById.get(quote.job_id) : null;
    if (job) return job.customer_name;
  }
  return "Linked customer";
}

function newestDate(current: string | null, next: string | null | undefined) {
  if (!next) return current;
  if (!current) return next;
  return Date.parse(next) > Date.parse(current) ? next : current;
}

function pushUnique<T>(items: T[], id: string, value: T) {
  if (!items.some((item) => String((item as { id?: string }).id) === id)) {
    items.push(value);
  }
}
