"use client";

import { track } from "@vercel/analytics";
import { getGoogleAdsId } from "@/lib/tracking-config";

type Gtag = (...args: unknown[]) => void;
type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    fbq?: Fbq;
  }
}

type LeadEventParams = {
  eventId?: string;
  value?: number;
  currency?: string;
  interest?: string;
  city?: string;
  pagePath?: string;
};

type BookingEventParams = {
  eventId?: string;
  jobId?: string;
  productTypes?: string[];
  windowCount?: string;
  followUpRequested?: boolean;
  pagePath?: string;
};

type BookingStepParams = {
  step: "open" | "availability_request" | "date_select" | "time_select";
  location?: string;
  productTypes?: string[];
  windowCount?: string;
  pagePath?: string;
};

function googleAdsSendTo(conversionLabel?: string) {
  const adsId = getGoogleAdsId();
  if (!adsId || !conversionLabel) {
    return undefined;
  }
  return `${adsId}/${conversionLabel}`;
}

function productInterestLabel(productTypes?: string[]) {
  return productTypes?.length ? productTypes.join(", ") : "consultation";
}

export function trackLeadEvent(params: LeadEventParams = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const eventId = params.eventId;
  const eventParams = {
    event_category: "lead",
    event_label: params.interest || "consultation",
    value: params.value ?? 1,
    currency: params.currency || "USD",
    page_path: params.pagePath || window.location.pathname,
    city: params.city || undefined,
    interest: params.interest || undefined
  };

  window.gtag?.("event", "generate_lead", {
    ...eventParams,
    send_to: googleAdsSendTo(process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_LABEL)
  });

  window.fbq?.(
    "track",
    "Lead",
    {
      content_name: "Free Window Treatment Consultation",
      content_category: "window_treatments",
      value: eventParams.value,
      currency: eventParams.currency,
      city: params.city,
      interest: params.interest
    },
    eventId ? { eventID: eventId } : undefined
  );

  track("Lead", {
    interest: params.interest || "consultation",
    city: params.city || null,
    page_path: eventParams.page_path,
    has_event_id: Boolean(eventId)
  });
}

export function trackPhoneClick(location: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.gtag?.("event", "phone_click", {
    event_category: "contact",
    event_label: "805-806-9344",
    phone_location: location,
    send_to: googleAdsSendTo(process.env.NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION_LABEL)
  });

  window.fbq?.("track", "Contact", {
    content_name: "Phone Click",
    content_category: "window_treatments",
    phone_location: location
  });

  track("Phone Click", {
    location,
    page_path: window.location.pathname
  });
}

export function trackBookingStep(params: BookingStepParams) {
  if (typeof window === "undefined") {
    return;
  }

  const pagePath = params.pagePath || window.location.pathname;
  const productTypes = productInterestLabel(params.productTypes);

  window.gtag?.("event", `booking_${params.step}`, {
    event_category: "booking",
    event_label: params.location || params.step,
    page_path: pagePath,
    product_interest: productTypes,
    window_count: params.windowCount || undefined
  });

  track("Booking Step", {
    step: params.step,
    location: params.location || null,
    page_path: pagePath,
    product_interest: productTypes,
    window_count: params.windowCount || null
  });
}

export function trackBookingEvent(params: BookingEventParams = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const eventId = params.eventId;
  const pagePath = params.pagePath || window.location.pathname;
  const productTypes = productInterestLabel(params.productTypes);
  const eventParams = {
    event_category: "booking",
    event_label: "self_booking",
    value: 1,
    currency: "USD",
    page_path: pagePath,
    product_interest: productTypes,
    window_count: params.windowCount || undefined,
    follow_up_requested: params.followUpRequested
  };

  window.gtag?.("event", "generate_lead", {
    ...eventParams,
    send_to: googleAdsSendTo(process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_LABEL)
  });

  window.fbq?.(
    "track",
    "Lead",
    {
      content_name: "Self-Booked Consultation",
      content_category: "window_treatments",
      value: eventParams.value,
      currency: eventParams.currency,
      product_interest: productTypes,
      window_count: params.windowCount,
      follow_up_requested: params.followUpRequested
    },
    eventId ? { eventID: eventId } : undefined
  );

  track("Booking", {
    product_interest: productTypes,
    window_count: params.windowCount || null,
    follow_up_requested: params.followUpRequested ?? null,
    page_path: pagePath,
    has_event_id: Boolean(eventId),
    has_job_id: Boolean(params.jobId)
  });
}
