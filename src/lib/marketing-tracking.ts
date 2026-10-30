import { isPublicFacingPath } from "./public-activity";

// This is intentionally narrower than existing analytics coverage. GTM is for
// the agency's public marketing site, not customer documents or staff tools.
const privatePrefixes = [
  "/crm", "/quote", "/quote-lab", "/autopay", "/installer-form", "/staff-booking-sms",
];

export const GTM_CONTAINER_ID = "GTM-MLVF9PP3";

export function isMarketingTrackingPath(value: string | null | undefined): boolean {
  if (!value || !isPublicFacingPath(value)) return false;
  const pathname = new URL(value, "https://www.805shutters.com").pathname;
  if (/\.[^/]+\/?$/.test(pathname)) return false;
  return !privatePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function crossesMarketingBoundary(from: string | null, to: string): boolean {
  // An unknown source must use a fresh document, so no loaded container can
  // accidentally follow a client navigation into a private workflow.
  return !from || isMarketingTrackingPath(from) !== isMarketingTrackingPath(to);
}

export const gtmBootstrap = `(function(w,d,s,l,i){
if(w.__805GtmLoaded)return;w.__805GtmLoaded=true;
w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`;
