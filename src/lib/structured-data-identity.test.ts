import { describe, expect, it } from "vitest";
import { localBusinessJsonLd, servicePageJsonLd, answerPageJsonLd } from "./structured-data";
import { getPageByPath } from "./site-data";
import { getAnswerPage } from "./llm-search-pages";
import { approvedProfiles, verifiedDirectoryProfiles, normalizeStructuredData } from "./structured-data-identity";

type Node = Record<string, any>;
const normalize = (data: unknown) => normalizeStructuredData(data) as Node;
const business = () => normalize(localBusinessJsonLd())["@graph"][0] as Node;

describe("approved schema-only business identity", () => {
  it("locks the rendered business name, international phone, email, URL and established ID", () => {
    expect(business()).toMatchObject({
      "@id": "https://www.805shutters.com#local-business",
      name: "805 Shutters", telephone: "+1-805-806-9344",
      email: "805@805shutters.com", url: "https://www.805shutters.com/",
      foundingDate: "1995"
    });
    expect(business().contactPoint).toMatchObject({ telephone: "+1-805-806-9344", email: "805@805shutters.com" });
  });

  it("includes the fourteen Ventura areas plus Santa Clarita and north LA County without an address", () => {
    expect(business().areaServed.map((area: Node) => area.name)).toEqual([
      "Ventura County", "Oxnard", "Ventura", "Camarillo", "Ojai", "Simi Valley", "Port Hueneme",
      "Thousand Oaks", "Fillmore", "Moorpark", "Oak Park", "Westlake Village", "Santa Paula", "Santa Rosa Valley", "Newbury Park",
      "Santa Clarita", "North Los Angeles County"
    ]);
    expect(business().contactPoint.areaServed).toEqual(business().areaServed);
    expect(business().serviceArea).toEqual(business().areaServed);
    expect(business()).not.toHaveProperty("address");
    expect(business().sameAs).toEqual(expect.arrayContaining([
      "https://www.facebook.com/805shutters", "https://www.instagram.com/805shutters",
      "https://www.yelp.com/biz/805-shutters-shades-blinds-camarillo-2", "https://maps.google.com/?cid=14597332202667384985"
    ]));
  });

  it("keeps only approved profiles and phone-verified directories", () => {
    const original = localBusinessJsonLd();
    original["@graph"][0].sameAs = [
      "https://www.uahot.com/business-61358.html", "https://www.allbiz.com/",
      "https://805shuttersandshades.com/",
      "https://www.bbb.org/us/ca/camarillo/profile/window-coverings/805-shutters-shades-blinds-1236-3001378"
    ];
    expect(normalize(original)["@graph"][0].sameAs).toEqual([...approvedProfiles, ...verifiedDirectoryProfiles]);
    expect(business().sameAs).toEqual([...approvedProfiles, ...verifiedDirectoryProfiles]);
  });

  it("preserves the confirmed hours, price range, founder, owner and free consultation", () => {
    expect(business()).toMatchObject({
      priceRange: "$$",
      founder: { "@type": "Person", name: "Ken Hill" },
      owner: { "@type": "Person", name: "Ken Hill" },
      openingHoursSpecification: [{ "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        opens: "08:00", closes: "18:00" }],
      potentialAction: { name: "Book a free in-home window treatment consultation" }
    });
    expect(business().description).toContain("family-owned");
  });

  it("uses a reference to the shared business on the shades page", () => {
    const page = normalize(servicePageJsonLd(getPageByPath("/shades/")!));
    expect(JSON.stringify(page)).toContain('"@id":"https://www.805shutters.com#local-business"');
    expect(JSON.stringify(page)).not.toContain('"telephone":"805-806-9344"');
  });

  it("replaces duplicate business definitions with references and retains service city detail", () => {
    const payload = { provider: { "@id": "https://www.805shutters.com#local-business", name: "stale", telephone: "stale" }, areaServed: [{ "@type": "City", name: "Camarillo" }] };
    expect(normalize(payload)).toEqual({ provider: { "@id": "https://www.805shutters.com#local-business" }, areaServed: payload.areaServed });
    expect(payload.provider.name).toBe("stale");
  });

  it("fixes property ranges without inventing prices, hours, or changing review markup", () => {
    const original = localBusinessJsonLd()["@graph"][0] as Node;
    expect(business().makesOffer[0]).toEqual({ "@type": "Offer", itemOffered: { "@type": "Service", name: "Custom shutters" } });
    expect(business().priceRange).toBe(original.priceRange);
    expect(business().openingHoursSpecification).toEqual(original.openingHoursSpecification);
    const review = { "@type": "Review", reviewRating: { ratingValue: 5 } };
    expect(normalize({ review })).toEqual({ review });
    const page = getAnswerPage("commercial-roller-shades-ventura-county")!;
    const nodes = normalize(answerPageJsonLd(page))["@graph"] as Node[];
    expect(nodes.find((n) => n["@type"] === "Service")?.availableChannel.servicePhone).toEqual({ "@type": "ContactPoint", telephone: "+1-805-806-9344" });
  });
});
