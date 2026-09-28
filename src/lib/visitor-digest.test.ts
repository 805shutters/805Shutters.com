import { expect, it } from "vitest";
import { buildDailyVisitorDigest, visitorSource } from "./visitor-digest";
it("includes both platforms and shared campaign traffic without double counting", () => {
  const result = buildDailyVisitorDigest([
    { metadata: { referrer: "l.facebook.com/" } },
    { metadata: { referrer: "l.instagram.com/" } },
    { metadata: { utm_source: "facebook" } },
    { metadata: { utm_source: "instagram" } },
    { metadata: { source: "Instagram" } },
    { metadata: { referrer: "www.google.com/" } },
  ]);
  expect(result).toContain("Total visits: 6");
  expect(result).toContain("Facebook: 1");
  expect(result).toContain("Instagram: 3");
  expect(result).toContain("Facebook/Instagram (placement unknown): 1");
  expect(result).toContain("Google: 1");
});
it("mentions Facebook and Instagram even on a day without their visits", () => {
  const result = buildDailyVisitorDigest([{ metadata: null }]);
  expect(result).toContain("Facebook: 0"); expect(result).toContain("Instagram: 0");
  expect(visitorSource({ referrer: "facebook.com.evil.example/" })).toBe("facebook.com.evil.example");
});
