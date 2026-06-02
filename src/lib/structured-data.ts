import { site } from "./site-data";

export function localBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: site.name,
    url: site.baseUrl,
    telephone: site.phone,
    areaServed: site.areas.map((area) => ({
      "@type": "City",
      name: area
    })),
    address: {
      "@type": "PostalAddress",
      addressRegion: "CA",
      addressCountry: "US"
    },
    makesOffer: [
      "Custom shutters",
      "Custom window shades",
      "Custom blinds",
      "Commercial window coverings"
    ]
  };
}
