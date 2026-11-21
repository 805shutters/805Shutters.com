"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isPublicFacingPath } from "@/lib/public-activity";
import { getGa4Ids, getGoogleAdsId } from "@/lib/tracking-config";

import { trackPairedInteraction } from "@/lib/meta-pixel";

export function RouteTracking() {
  const pathname = usePathname();
  const didMount = useRef(false);
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (!isPublicFacingPath(pathname)) return;
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    trackPairedInteraction("PageView", pathname);

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

  useEffect(() => {
    function onContact(event: MouseEvent) {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor && /^(tel|sms|mailto):/i.test(anchor.getAttribute("href") || "")) {
        trackPairedInteraction("Contact", window.location.pathname);
      }
    }
    document.addEventListener("click", onContact, true);
    return () => document.removeEventListener("click", onContact, true);
  }, []);

  return null;
}
