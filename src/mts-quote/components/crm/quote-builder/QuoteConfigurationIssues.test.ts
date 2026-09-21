import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuoteConfigurationIssues } from "./QuoteConfigurationIssues";
import type { ValidationIssue } from "@/lib/quote-v2/core";

const source = { sourceId: "fixture", fileName: "Roman Guide", revision: "test", effectiveDate: null, sha256: "fixture" };
const fit: ValidationIssue = { ruleId: "roman.hardware.mount_depth", severity: "hard_block", source, selectedValues: {}, explanation: "Flush Inside requires at least 2.125 inches of mounting depth." };
const price: ValidationIssue = { ruleId: "roman.fabric.grid_missing", severity: "hard_block", source, selectedValues: {}, explanation: "This fabric has no matching price grid." };
describe("quote-time configuration messages", () => {
  it("omits installation evidence from the quote", () => {
    const html = renderToStaticMarkup(React.createElement(QuoteConfigurationIssues, { issues: [fit], gridOptionQuoting: true }));
    expect(html).toBe("");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Pricing details needed");
    expect(fit.severity).toBe("hard_block");
  });
  it("retains specific missing pricing while hiding order warnings", () => {
    const html = renderToStaticMarkup(React.createElement(QuoteConfigurationIssues, { issues: [fit, price], gridOptionQuoting: true }));
    expect(html).toContain('role="alert"'); expect(html).not.toContain('role="status"');
    expect(html).toContain(price.explanation); expect(html).toContain("Pricing details needed");
  });
  it("also omits installation prompts from the legacy quote", () => {
    const html = renderToStaticMarkup(React.createElement(QuoteConfigurationIssues, { issues: [fit], gridOptionQuoting: false }));
    expect(html).toBe("");
  });
});
