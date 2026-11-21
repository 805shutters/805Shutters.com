import { describe, expect, it } from "vitest";
import { parseDocument } from "htmlparser2";
import { findAll } from "domutils";
import { optimizeEditorialImages } from "./editorial-images";

describe("editorial image delivery", () => {
  it("keeps copy and links while making the first hero discoverable and responsive", () => {
    const src = "/images/portfolio-enhanced/recent-two-story-arch-plantation-shutters-wide.jpg";
    const output = optimizeEditorialImages(`<h1>Shutters &amp; shades</h1><img src="https://www.805shutters.com${src}" alt="Arched shutters"><a href="/book-consultation/">Book</a><img src="${src}" alt="Detail">`, true);
    const imgs = findAll(node => node.name === "img", parseDocument(output).children);
    expect(imgs[0].attribs).toMatchObject({ loading: "eager", fetchpriority: "high", alt: "Arched shutters" });
    expect(Number(imgs[0].attribs.width)).toBeGreaterThan(0);
    expect(imgs[0].attribs.srcset).toContain("/_next/image?");
    expect(imgs[0].attribs.src).toContain("%3Fv%3D");
    expect(imgs[1].attribs.loading).toBe("lazy");
    expect(output).toContain('href="/book-consultation/"');
    expect(output).toContain("Shutters &amp; shades");
  });

  it("preserves unknown external images without sending them to the optimizer", () => {
    const input = '<img src="https://example.com/customer.jpg" alt="Customer photo">';
    expect(optimizeEditorialImages(input)).toBe(input);
  });
});
