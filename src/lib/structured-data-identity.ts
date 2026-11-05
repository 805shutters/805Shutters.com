// Schema-only facts approved for the September 2026 audit. Do not use these
// overrides to change visible copy, metadata, or other page content.
export const businessIdentity = {
  "@id": "https://www.805shutters.com#local-business",
  name: "805 Shutters",
  telephone: "+1-805-806-9344",
  email: "805@805shutters.com",
  url: "https://www.805shutters.com/"
} as const;

export const approvedServiceAreas = [
  "Oxnard", "Ventura", "Camarillo", "Ojai", "Simi Valley", "Port Hueneme",
  "Thousand Oaks", "Fillmore", "Moorpark", "Oak Park", "Westlake Village",
  "Santa Paula", "Santa Rosa Valley", "Newbury Park",
  "Santa Clarita", "North Los Angeles County"
] as const;

export const approvedProfiles = [
  "https://www.facebook.com/805shutters",
  "https://www.instagram.com/805shutters",
  "https://www.yelp.com/biz/805-shutters-shades-blinds-camarillo-2",
  "https://maps.google.com/?cid=14597332202667384985"
] as const;

// Public listings checked against the business website and approved phone on
// 2026-09-25. Do not merge unverified legacy directory URLs into sameAs.
export const verifiedDirectoryProfiles = [
  "https://www.mapquest.com/us/california/805-shutters-378112738",
  "https://local.yahoo.com/info-225163327-805-shutters/",
  "https://www.chamberofcommerce.com/business-directory/california/santa-rosa-valley/window-treatment-store/2026058550-805-shutters-shades-blinds",
  "https://www.2findlocal.com/b/15023840/805-shutters-shades-blinds-santa-rosa-valley-ca"
] as const;

export function schemaPath(path: string) {
  return path === "/" ? path : `${path.replace(/\/+$/, "")}/`;
}

function serviceAreas() {
  return [
    { "@type": "AdministrativeArea", name: "Ventura County" },
    ...approvedServiceAreas.map((name) => ({ "@type": "Place", name }))
  ];
}

// Keep the existing entity ID, including its established no-slash fragment.
// Partial provider/mainEntity nodes reference the one complete layout entity.
export function normalizeStructuredData(value: unknown): unknown {
  function visit(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(visit);
    if (!input || typeof input !== "object") return input;
    const source = input as Record<string, unknown>;
    const isBusiness = source["@id"] === businessIdentity["@id"];
    if (isBusiness && !source.hasOfferCatalog) return { "@id": businessIdentity["@id"] };
    const node: Record<string, unknown> = Object.fromEntries(
      Object.entries(source).map(([key, child]) => [key, visit(child)])
    );
    if (isBusiness) {
      Object.assign(node, businessIdentity);
      node.areaServed = serviceAreas();
      node.serviceArea = serviceAreas();
      node.foundingDate = "1995";
      node.hasMap = approvedProfiles[3];
      node.sameAs = [...approvedProfiles, ...verifiedDirectoryProfiles];
      if (node.contactPoint && typeof node.contactPoint === "object") {
        Object.assign(node.contactPoint, {
          telephone: businessIdentity.telephone, email: businessIdentity.email,
          areaServed: serviceAreas()
        });
      }
      if (Array.isArray(node.makesOffer)) {
        node.makesOffer = node.makesOffer.map((offer) => typeof offer === "string"
          ? { "@type": "Offer", itemOffered: { "@type": "Service", name: offer } }
          : offer);
      }
    }
    // Replace the old company-wide coverage, while retaining a service's
    // specific city, including the approved Santa Clarita service pages.
    if (!isBusiness && (typeof source.areaServed === "string" && source.areaServed.includes("North Los Angeles County") || Array.isArray(source.areaServed) && source.areaServed.length > 1)) {
      node.areaServed = serviceAreas();
    }
    if (source["@type"] === "ServiceChannel" && typeof source.servicePhone === "string") {
      node.servicePhone = { "@type": "ContactPoint", telephone: businessIdentity.telephone };
    }
    return node;
  }
  return visit(value);
}
