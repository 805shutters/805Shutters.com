"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { metaBookingSource } from "@/lib/meta-booking-alert";

const key = "805.metaBookingAlert";
let fallback: { id: string; expires: number; sent?: boolean } | undefined;

export function MetaBookingAlertTracking() {
  const pathname = usePathname();
  useEffect(() => {
    const send = () => {
      if (document.visibilityState !== "visible") return;
      const path = window.location.pathname + window.location.search;
      if (!metaBookingSource(path, document.referrer, navigator.userAgent)) return;
      let visit = fallback;
      try { visit = JSON.parse(sessionStorage.getItem(key) || "null") || visit; } catch { /* Use memory when storage is blocked. */ }
      if (!visit || typeof visit.id !== "string" || !(visit.expires > Date.now())) {
        visit = { id: crypto.randomUUID(), expires: Date.now() + 30 * 60_000 };
      }
      if (visit.sent) return;
      visit.sent = true;
      fallback = visit;
      try { sessionStorage.setItem(key, JSON.stringify(visit)); } catch { /* Memory still prevents repeated renders. */ }
      void fetch("/api/meta-booking-alerts/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: visit.id, path, referrer: document.referrer }),
        keepalive: true,
      }).catch(() => { /* Never interfere with booking or retry an uncertain SMS. */ });
    };
    send();
    document.addEventListener("visibilitychange", send);
    return () => document.removeEventListener("visibilitychange", send);
  }, [pathname]);
  return null;
}
