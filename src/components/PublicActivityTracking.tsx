"use client";

import { Analytics, type AnalyticsProps } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { BeforeSendMiddleware as SpeedInsightsBeforeSend } from "@vercel/speed-insights";
import { usePathname } from "next/navigation";
import { RouteTracking } from "@/components/RouteTracking";
import { TrackingScripts } from "@/components/TrackingScripts";
import { VisitorTelegramTracking } from "@/components/VisitorTelegramTracking";
import { isPublicFacingPath } from "@/lib/public-activity";

const onlyPublicAnalytics: NonNullable<AnalyticsProps["beforeSend"]> = (event) =>
  isPublicFacingPath(event.url) ? event : null;

const onlyPublicSpeedInsights: SpeedInsightsBeforeSend = (event) =>
  isPublicFacingPath(event.url) ? event : null;

export function PublicActivityTracking() {
  const pathname = usePathname();
  const isPublicPage = isPublicFacingPath(pathname);

  return (
    <>
      {isPublicPage ? (
        <>
          <TrackingScripts />
          <RouteTracking />
          <VisitorTelegramTracking />
          <Analytics beforeSend={onlyPublicAnalytics} />
          <SpeedInsights beforeSend={onlyPublicSpeedInsights} />
        </>
      ) : null}
    </>
  );
}
