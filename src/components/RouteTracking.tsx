"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isPublicFacingPath } from "@/lib/public-activity";
import { getGa4Ids, getGoogleAdsId } from "@/lib/tracking-config";

import { metaPixel } from "@/lib/meta-pixel";

export function RouteTracking() {
  const pathname = usePathname();
  const didMount = useRef(false);
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (!isPublicFacingPath(pathname)) return;
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    metaPixel("track", "PageView");

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

  }, [pathname]);

  return null;
}
