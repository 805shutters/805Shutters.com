import { describe, expect, it } from "vitest";
import { getAnswerPage } from "@/lib/llm-search-pages";
import { getPageByPath, site } from "@/lib/site-data";
import {
  answerPageJsonLd,
  commercialSubPageJsonLd,
  localBusinessJsonLd,
  servicePageJsonLd
} from "@/lib/structured-data";

type JsonLdNode = Record<string, unknown>;

function graphFrom(payload: JsonLdNode) {
  const graph = payload["@graph"];
  expect(Array.isArray(graph)).toBe(true);
  return graph as JsonLdNode[];
}

function nodeTypes(node: JsonLdNode) {
  const type = node["@type"];
  return Array.isArray(type) ? type : [type];
}

function findNode(graph: JsonLdNode[], type: string) {
  return graph.find((node) => nodeTypes(node).includes(type));
}

function findNodeById(graph: JsonLdNode[], id: string) {
  return graph.find((node) => node["@id"] === id);
}

describe("structured data", () => {
  it("connects the local business entity to the website entity", () => {
    const graph = graphFrom(localBusinessJsonLd());
    const business = findNode(graph, "LocalBusiness");
    const website = findNode(graph, "WebSite");

    expect(business?.["@id"]).toBe(`${site.baseUrl}#local-business`);
    expect(nodeTypes(business ?? {})).toContain("HomeAndConstructionBusiness");
    expect(business?.name).toBe(site.legalName);
    expect(business?.hasMap).toBe(site.googleMaps.url);
    expect(business?.identifier).toMatchObject({
      "@type": "PropertyValue",
      propertyID: "Google Maps CID",
      value: site.googleMaps.cid
    });
    expect(business?.sameAs).toContain(site.social.yelp);
    expect(business?.sameAs).toContain(site.googleMaps.url);
    expect(business?.contactPoint).toMatchObject({
      "@type": "ContactPoint",
      telephone: site.phone,
      email: site.email
    });

    expect(website).toMatchObject({
      "@type": "WebSite",
      "@id": `${site.baseUrl}#website`,
      publisher: {
        "@id": `${site.baseUrl}#local-business`
      }
    });
  });

  it("emits offer, product, service, FAQ, and process nodes for answer pages", () => {
    const page = getAnswerPage("commercial-roller-shades-ventura-county");
    expect(page).toBeDefined();
    if (!page) return;

    const pageUrl = `${site.baseUrl}${page.path}`;
    const graph = graphFrom(answerPageJsonLd(page));
    const webpage = findNode(graph, "WebPage");
    const service = findNodeById(graph, `${pageUrl}#service`);
    const offerCatalog = findNodeById(graph, `${pageUrl}#offer-catalog`);
    const recommendedOptions = findNodeById(graph, `${pageUrl}#recommended-options`);
    const faq = findNode(graph, "FAQPage");
    const howTo = findNode(graph, "HowTo");
    const firstOffer = (offerCatalog?.itemListElement as JsonLdNode[] | undefined)?.[0];
    const firstItemOffered = firstOffer?.itemOffered as JsonLdNode | undefined;

    expect(webpage).toMatchObject({
      mainEntity: {
        "@id": `${pageUrl}#service`
      },
      isPartOf: {
        "@id": `${site.baseUrl}#website`
      }
    });
    expect(service).toMatchObject({
      "@type": "Service",
      hasOfferCatalog: {
        "@id": `${pageUrl}#offer-catalog`
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      }
    });
    expect((offerCatalog?.itemListElement as JsonLdNode[] | undefined)?.length).toBe(page.serviceTypes.length);
    expect(nodeTypes(firstItemOffered ?? {})).toEqual(expect.arrayContaining(["Service"]));
    expect(nodeTypes(firstItemOffered ?? {})).not.toContain("Product");
    expect(firstItemOffered).toMatchObject({
      provider: {
        "@id": `${site.baseUrl}#local-business`
      }
    });
    expect(recommendedOptions).toMatchObject({
      "@type": "ItemList",
      numberOfItems: page.serviceTypes.length
    });
    expect(faq?.mainEntity).toHaveLength(page.faqs.length);
    expect(howTo?.step).toHaveLength(3);
  });

  it("connects service pages to their crawlable primary image", () => {
    const page = getPageByPath("/shutters/camarillo/");
    expect(page).toBeDefined();
    if (!page) return;

    const graph = graphFrom(servicePageJsonLd(page));
    const webpage = findNode(graph, "WebPage");
    const service = findNode(graph, "Service");

    expect(webpage?.primaryImageOfPage).toMatchObject({
      "@type": "ImageObject",
      contentUrl: `${site.baseUrl}${page.image}`,
      caption: page.imageAlt
    });
    expect(webpage?.mainEntity).toEqual({ "@id": service?.["@id"] });
  });

  it("adds the same image relationship to commercial location pages", () => {
    const page = getPageByPath("/commercial-window-coverings/camarillo-ca/");
    expect(page).toBeDefined();
    if (!page) return;

    const graph = graphFrom(commercialSubPageJsonLd(page, "Camarillo"));
    expect(findNode(graph, "WebPage")?.primaryImageOfPage).toMatchObject({
      contentUrl: `${site.baseUrl}${page.image}`,
      caption: page.imageAlt
    });
  });
});
