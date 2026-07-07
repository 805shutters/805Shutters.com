import { describe, expect, it } from "vitest";
import { classifyLeadSource, getLeadSourceFromRecord, hydrateLeadSource, withLeadSourceMeta } from "@/lib/lead-source";

describe("classifyLeadSource", () => {
  it("prefers gclid as a Google Ads signal", () => {
    expect(classifyLeadSource({ gclid: "abc123", referrer: "https://www.yelp.com/biz/805" })).toBe("Google Ads");
  });

  it("classifies utm sources", () => {
    expect(classifyLeadSource({ utmSource: "google", utmMedium: "cpc" })).toBe("Google Ads");
    expect(classifyLeadSource({ utmSource: "google" })).toBe("Google Search");
    expect(classifyLeadSource({ utmSource: "gbp" })).toBe("Google Maps");
    expect(classifyLeadSource({ utmSource: "facebook", utmMedium: "paid" })).toBe("Facebook");
    expect(classifyLeadSource({ utmSource: "ig" })).toBe("Instagram");
    expect(classifyLeadSource({ utmSource: "yelp" })).toBe("Yelp");
    expect(classifyLeadSource({ utmSource: "nextdoor" })).toBe("Nextdoor");
    expect(classifyLeadSource({ utmSource: "chatgpt.com" })).toBe("AI Chat");
    expect(classifyLeadSource({ utmSource: "bing" })).toBe("Bing / Other Search");
  });

  it("falls back to the external referrer", () => {
    expect(classifyLeadSource({ referrer: "https://www.google.com/" })).toBe("Google Search");
    expect(classifyLeadSource({ referrer: "https://maps.google.com/place" })).toBe("Google Maps");
    expect(classifyLeadSource({ referrer: "https://m.facebook.com/l.php" })).toBe("Facebook");
    expect(classifyLeadSource({ referrer: "https://www.nextdoor.com/p/abc" })).toBe("Nextdoor");
    expect(classifyLeadSource({ referrer: "https://chatgpt.com/" })).toBe("AI Chat");
    expect(classifyLeadSource({ referrer: "https://duckduckgo.com/" })).toBe("Bing / Other Search");
  });

  it("returns null when nothing identifies the channel", () => {
    expect(classifyLeadSource({})).toBeNull();
    expect(classifyLeadSource({ referrer: "not a url" })).toBeNull();
    expect(classifyLeadSource({ referrer: "https://805shutters.com/shutters/" })).toBeNull();
    expect(classifyLeadSource({ utmSource: "newsletter" })).toBeNull();
  });

  it("stores and hydrates lead source from metadata as a schema fallback", () => {
    const record = withLeadSourceMeta({ lead_source: "Facebook", meta: { source: "website" } });

    expect(record.meta).toMatchObject({ lead_source: "Facebook", leadSource: "Facebook" });
    expect(getLeadSourceFromRecord({ meta: record.meta })).toBe("Facebook");
    expect(hydrateLeadSource({ meta: record.meta })).toMatchObject({ lead_source: "Facebook" });
  });
});
