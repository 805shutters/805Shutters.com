"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function RouteTracking() {
  const pathname = usePathname();
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;
    const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

    if (ga4Id) {
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
