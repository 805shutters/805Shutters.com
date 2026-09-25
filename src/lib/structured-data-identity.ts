// Schema-only facts approved for the September 2026 audit. Do not use these
// overrides to change visible copy, metadata, or the protected routes.
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
  "Santa Paula", "Santa Rosa Valley", "Newbury Park"
] as const;

export const approvedProfiles = [
  "https://www.facebook.com/805shutters",
  "https://www.instagram.com/805shutters",
  "https://www.yelp.com/biz/805-shutters-shades-blinds-camarillo-2",
  "https://maps.google.com/?cid=14597332202667384985"
] as const;

export function schemaPath(path: string) {
  return path === "/" ? path : `${path.replace(/\/+$/, "")}/`;
}

export function isProtectedSchemaPath(path: string) {
  return ["/", "/shades/"].includes(schemaPath(path));
}

function serviceAreas() {
  return [
    { "@type": "AdministrativeArea", name: "Ventura County" },
    ...approvedServiceAreas.map((name) => ({ "@type": "Place", name }))
  ];
}

// Keep the existing entity ID, including its established no-slash fragment.
// Partial provider/mainEntity nodes reference the one complete layout entity.
export function normalizeStructuredData(value: unknown, path: string): unknown {
  if (isProtectedSchemaPath(path)) return value;
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
      node.serviceArea = { "@type": "AdministrativeArea", name: "Ventura County" };
      node.foundingDate = "1995";
      node.hasMap = approvedProfiles[3];
      const existing = Array.isArray(node.sameAs) ? node.sameAs : [];
      node.sameAs = [...new Set([
        ...approvedProfiles,
        ...existing.filter((url) => url !== "https://www.instagram.com/805shutters/" && url !== "https://www.google.com/maps?cid=14597332202667384985")
      ])];
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
    // specific city (including flagged Santa Clarita page content for review).
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
