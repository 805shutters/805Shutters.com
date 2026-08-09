import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ConditionalChrome.tsx", import.meta.url), "utf8");

describe("ConditionalChrome customer quote route", () => {
  it("renders quote routes without the public website header, footer, or assistant", () => {
    expect(source).toContain("if (isQuoteRoute)");
    expect(source).toContain("return <>{children}</>");
    expect(source.indexOf("if (isQuoteRoute)")).toBeLessThan(source.indexOf("<SiteHeader />"));
    expect(source).toContain("if (isCrmRoute) {\n    return <main>{children}</main>;");
  });
});
