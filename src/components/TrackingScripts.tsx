import Script from "next/script";
import { getGa4Ids, getGoogleAdsId } from "@/lib/tracking-config";

export function TrackingScripts() {
  const ga4Ids = getGa4Ids();
  const googleAdsId = getGoogleAdsId();
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

    </>
  );
}
