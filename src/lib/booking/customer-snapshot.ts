import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertCrmCustomer } from "@/lib/crm/backend";

export type SelfBookingCustomerDetails = {
  leadId: string;
  jobId: string;
  calendarEventId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  windowCount: number;
  productInterest: string;
  productTypes: string[];
  bookingNotes: string;
  startAt: string;
  endAt: string;
};

export function buildSelfBookingCustomerSnapshot(details: SelfBookingCustomerDetails) {
  return {
    displayName: details.name,
    phone: details.phone,
    email: details.email || null,
    address: details.address,
    latestStatus: "scheduled",
    source: "crm" as const,
    notes: details.bookingNotes || "Self-booked appointment.",
    meta: {
      lastLeadId: details.leadId,
      lastJobId: details.jobId,
      lastCalendarEventId: details.calendarEventId,
      bookingSource: "website",
      appointmentStart: details.startAt,
      appointmentEnd: details.endAt,
      windowCount: details.windowCount || null,
      productTypes: details.productTypes
    }
  };
}

export function buildSelfBookingProductRecord(details: SelfBookingCustomerDetails, customerId: string) {
  const productType = details.productTypes.length ? details.productTypes.join(", ") : "Window Treatments";
  const descriptionParts = [
    details.windowCount ? `Approx. windows: ${details.windowCount}` : null,
    details.bookingNotes || null
  ].filter(Boolean);

  return {
    customer_id: customerId,
    job_id: details.jobId,
    quote_id: null,
    bookkeeping_entry_id: null,
    product_type: productType,
    description: descriptionParts.join("\n") || "Self-booked appointment.",
    quantity: details.windowCount || 1,
    status: "scheduled",
    meta: {
      source: "self_booking",
      leadId: details.leadId,
      calendarEventId: details.calendarEventId,
      productInterest: details.productInterest,
      productTypes: details.productTypes,
      windowCount: details.windowCount || null,
      appointmentStart: details.startAt,
      appointmentEnd: details.endAt
    }
  };
}

export async function syncSelfBookingCustomerDetails(
  supabase: SupabaseClient,
  details: SelfBookingCustomerDetails
) {
  const customer = await upsertCrmCustomer(supabase, buildSelfBookingCustomerSnapshot(details));
  if (!customer) return { customer: null, productSaved: false };

  const { error } = await supabase
    .from("crm_customer_products")
    .insert(buildSelfBookingProductRecord(details, customer.id));

  if (error) throw error;

  return { customer, productSaved: true };
}
