"use client";

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

function googleAdsSendTo(conversionLabel?: string) {
  const adsId = getGoogleAdsId();
  if (!adsId || !conversionLabel) {
    return undefined;
  }
  return `${adsId}/${conversionLabel}`;
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
}
