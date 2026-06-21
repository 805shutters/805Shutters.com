import {
  CrmBookkeepingRow,
  CrmCustomer,
  CrmCustomerContract,
  CrmCustomerFile,
  CrmCustomerProduct,
  CrmJob,
  CrmQuote
} from "@/lib/crm/types";
import { effectiveBookkeepingStatus } from "@/lib/crm/bookkeeping";

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
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const fileMap = new Map<string, CrmCustomerFile>();

  for (const customer of customers) {
    fileMap.set(customerKey(customer.normalized_name || customer.display_name), {
      id: customer.id,
      customer,
      customerName: customer.display_name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      latestStatus: customer.latest_status,
      latestSoldDate: customer.latest_sold_date,
      lifetimeValue: Number(customer.lifetime_value) || 0,
      openBalance: Number(customer.open_balance) || 0,
      jobs: [],
      quotes: [],
      bookkeepingRows: [],
      products: [],
      contracts: [],
      notes: customer.notes ? [customer.notes] : []
    });
  }

  for (const row of bookkeepingRows) {
    const key = customerKey(row.customerName);
    const file = ensureFile(fileMap, key, row.customerName);
    file.bookkeepingRows.push(row);
    file.lifetimeValue += Number(row.total) || 0;
    file.openBalance += Math.max(Number(row.balance) || 0, 0);
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

  for (const job of jobs) {
    const key = customerKey(job.customer_name);
    const file = ensureFile(fileMap, key, job.customer_name);
    pushUnique(file.jobs, job.id, job);
    file.phone ||= job.phone;
    file.email ||= job.email;
    file.address ||= job.address;
    file.city ||= job.city;
    file.latestStatus ||= job.status;
    file.openBalance += Math.max(0, Number(job.estimated_total || 0) - Number(job.deposit_paid || 0));
    file.lifetimeValue += Number(job.estimated_total) || 0;
    file.latestSoldDate = newestDate(file.latestSoldDate, job.appointment_start || job.created_at);
    if (job.notes) file.notes.push(job.notes);
  }

  for (const quote of quotes) {
    const job = jobById.get(quote.job_id);
    const key = customerKey(quote.customer_name || job?.customer_name || "");
    const file = ensureFile(fileMap, key, quote.customer_name || job?.customer_name || "Linked customer");
    pushUnique(file.quotes, quote.id, quote);
    if (job) pushUnique(file.jobs, job.id, job);
    if (!file.bookkeepingRows.length) file.latestStatus = quote.live_status || quote.status;
    file.latestSoldDate = newestDate(file.latestSoldDate, quote.sold_at || quote.approved_at || quote.created_at);
    if (quote.notes) file.notes.push(quote.notes);
  }

  for (const product of products) {
    const key = product.customer_id
      ? customerKey(customers.find((customer) => customer.id === product.customer_id)?.normalized_name || "")
      : relatedFileKey(product, jobById, quoteById);
    const file = key ? ensureFile(fileMap, key, fallbackRelatedName(product, jobById, quoteById)) : null;
    if (file) pushUnique(file.products, product.id, product);
  }

  for (const contract of contracts) {
    const key = contract.customer_id
      ? customerKey(customers.find((customer) => customer.id === contract.customer_id)?.normalized_name || "")
      : relatedFileKey(contract, jobById, quoteById);
    const file = key ? ensureFile(fileMap, key, fallbackRelatedName(contract, jobById, quoteById)) : null;
    if (file) pushUnique(file.contracts, contract.id, contract);
  }

  for (const file of fileMap.values()) {
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

function latestLiveStatus(file: CrmCustomerFile) {
  const latestRow = newestByDate(file.bookkeepingRows, (row) => row.soldDate);
  if (latestRow) return effectiveBookkeepingStatus(latestRow);

  const latestQuote = newestByDate(file.quotes, (quote) =>
    quote.sold_at || quote.approved_at || quote.ordered_at || quote.received_at || quote.installed_at || quote.created_at
  );
  if (latestQuote) return latestQuote.live_status || latestQuote.status;

  const latestJob = newestByDate(file.jobs, (job) => job.appointment_start || job.created_at);
  if (latestJob) return latestJob.status;

  return file.latestStatus;
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
