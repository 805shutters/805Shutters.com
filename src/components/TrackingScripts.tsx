import Script from "next/script";
import { getGa4Ids, getGoogleAdsId, getMetaPixelId } from "@/lib/tracking-config";

export function TrackingScripts() {
  const ga4Ids = getGa4Ids();
  const googleAdsId = getGoogleAdsId();
  const metaPixelId = getMetaPixelId();
  const gtagIds = [...ga4Ids, googleAdsId].filter((id): id is string => Boolean(id));

  return (
    <>
      {gtagIds.length > 0 ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gtagIds[0]}`}
            strategy="afterInteractive"
          />
          <Script id="google-tags" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              ${gtagIds.map((id) => `gtag('config', ${JSON.stringify(id)});`).join("\n")}
            `}
          </Script>
        </>
      ) : null}
      {metaPixelId ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', ${JSON.stringify(metaPixelId)});
            fbq('track', 'PageView');
          `}
        </Script>
      ) : null}
    </>
  );
}
