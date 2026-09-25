import { commercialCityName, type SitePage } from "@/lib/site-data";
import {
  commercialSubPageJsonLd,
  commercialWindowCoveringsJsonLd,
  faqPageJsonLd,
  servicePageJsonLd,
} from "@/lib/structured-data";

function isLocalServicePage(path: string) {
  return /^\/(shutters|shades|blinds|drapery|window-coverings|window-treatments)\/[^/]+\/$/.test(path);
}

export function pageJsonLdFor(page: SitePage) {
  if (page.path === "/commercial-window-coverings/") {
    return commercialWindowCoveringsJsonLd(page);
  }

  if (page.path.includes("commercial")) {
    return commercialSubPageJsonLd(page, commercialCityName(page.path));
  }

  if (page.path === "/faq/") {
    return faqPageJsonLd(page);
  }

  if (page.faqs?.length || isLocalServicePage(page.path)) {
    return servicePageJsonLd(page);
  }

  return null;
}
