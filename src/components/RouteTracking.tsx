"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { getGa4Ids, getGoogleAdsId } from "@/lib/tracking-config";

export function RouteTracking() {
  const pathname = usePathname();
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    const ga4Ids = getGa4Ids();
    const googleAdsId = getGoogleAdsId();

    for (const ga4Id of ga4Ids) {
      window.gtag?.("config", ga4Id, {
        page_path: pathname
      });
    }

    if (googleAdsId) {
      window.gtag?.("config", googleAdsId, {
        page_path: pathname
      });
    }
    window.fbq?.("track", "PageView");
  }, [pathname]);

  return null;
}
