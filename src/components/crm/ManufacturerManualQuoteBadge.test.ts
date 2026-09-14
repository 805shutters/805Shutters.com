import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ManufacturerManualQuoteBadge } from "./ManufacturerManualQuoteBadge";

describe("manual manufacturer pricing explanation", () => {
  it("explains Sundance authority gaps without naming Polar", () => {
    const html = renderToStaticMarkup(createElement(ManufacturerManualQuoteBadge, {manufacturer: "Sundance"}));
    expect(html).toContain("Sundance automation stopped");
    expect(html).toContain("Current account factors, retail/net exceptions, and complete configuration rules require verification");
    expect(html).not.toContain("Polar");
  });
  it("preserves the Polar internal-only boundary", () => {
    const html = renderToStaticMarkup(createElement(ManufacturerManualQuoteBadge, {manufacturer: "Polar"}));
    expect(html).toContain("No Polar price, customer-ready quote, status advance");
  });
});
