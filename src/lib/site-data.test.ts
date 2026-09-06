import { describe, expect, it } from "vitest";
import { allPages, getPageByPath } from "./site-data";

describe("site page quality", () => {
  it("offers only the in-house payment plan across public pages", () => {
    expect(JSON.stringify(allPages)).not.toMatch(/wisetack|0% APR|credit approval/i);
    const financing = getPageByPath("/financing/");
    expect(financing?.h1).toContain("In-House Payment Plans");
    expect(financing?.intro).toContain("written approval");
  });

  it("keeps every generated route unique", () => {
    const paths = allPages.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("does not pad residential location pages with repeated generic sections", () => {
    const page = getPageByPath("/shutters/camarillo/");
    expect(page).toBeDefined();
    expect(page?.sections.length).toBeGreaterThanOrEqual(3);
    expect(page?.sections.map((section) => section.heading)).not.toContain("Before A Project Is Ordered");
    expect(page?.sections.some((section) => section.heading.includes("Camarillo"))).toBe(true);
  });

  it("retains useful planning depth on parent service pages", () => {
    const page = getPageByPath("/shutters/");
    expect(page?.sections.map((section) => section.heading)).toContain("Before A Project Is Ordered");
  });

  it("publishes Santa Clarita pages with the approved North Los Angeles service context", () => {
    const page = getPageByPath("/window-treatments/santa-clarita-ca/");
    expect(page?.h1).toBe("Window Treatments in Santa Clarita");
    expect(page?.sections.map((section) => section.heading)).toContain(
      "North Los Angeles County and Santa Clarita installation support"
    );
  });
});
