"use client";

import { useEffect } from "react";

export function TechnicalMeasureOfflineRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/technical-measures-sw.js", { scope: "/crm/technical-measures" }).then(async (registration) => {
      await registration.update().catch(() => undefined);
      registration.active?.postMessage({
        type: "CACHE_MEASURE_ROUTES",
        urls: ["/crm/technical-measures", "/crm/technical-measures/offline"],
      });
    }).catch(() => undefined);
  }, []);
  return null;
}
