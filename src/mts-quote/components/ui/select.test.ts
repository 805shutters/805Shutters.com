import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectQuickButtonsProvider,
  SelectTrigger,
  SelectValue,
} from "./select";

function example(quick: boolean, disabled = false, count = 2) {
  const root = React.createElement(
    Select,
    { defaultValue: "one" },
    React.createElement(SelectTrigger, { id: "finish", disabled, className: "quote-style-select h-6 w-full", "aria-label": "Finish choice" }, React.createElement(SelectValue, { placeholder: "Finish" })),
    React.createElement(
      SelectContent,
      null,
      ...Array.from({ length: count }, (_, index) => React.createElement(SelectItem, { key: index, value: index ? `choice-${index}` : "one" }, index ? `Choice ${index}` : "One")),
    ),
  );
  return renderToStaticMarkup(quick ? React.createElement(SelectQuickButtonsProvider, null, root) : root);
}

describe("Select quick-button presentation", () => {
  it("keeps the normal Radix select presentation and trigger attributes by default", () => {
    const html = example(false, true);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('id="finish"');
    expect(html).toContain("disabled=\"\"");
    expect(html).not.toContain("data-mobile-quick-select");
  });

  it("renders labelled pressed buttons without a combobox or dropdown", () => {
    const html = example(true);
    expect(html).not.toContain('role="combobox"');
    expect(html).toContain('data-mobile-quick-select="true"');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Finish choice"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/<output[^>]*class="sr-only"/);
    expect(html).not.toContain("quote-style-select");
  });

  it("honors trigger disabled state and adds filtering for long lists", () => {
    const html = example(true, true, 13);
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain('aria-label="Filter choices"');
  });
});
