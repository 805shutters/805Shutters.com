"use client";

import { usePathname } from "next/navigation";
import { GTM_CONTAINER_ID, gtmBootstrap, isMarketingTrackingPath } from "@/lib/marketing-tracking";

// Render in the initial HTML, including when JavaScript is disabled. The proxy
// forces a new document across the public/private boundary; public SPA changes
// keep this stable script and the same container instance.
export function GoogleTagManagerHead() {
  const pathname = usePathname();
  if (!isMarketingTrackingPath(pathname)) return null;
  return <script id="805-gtm" dangerouslySetInnerHTML={{ __html: gtmBootstrap }} />;
}

export function GoogleTagManagerBody() {
  const pathname = usePathname();
  if (!isMarketingTrackingPath(pathname)) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
