import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectQuickButtonsProvider,
  quickSelectChoice,
  quickSelectInteraction,
  SelectTrigger,
  SelectValue,
} from "./select";

function example(quick: boolean, disabled = false, count = 2, collapseSelected = false, value = "one") {
  const root = React.createElement(
    Select,
    { defaultValue: value },
    React.createElement(SelectTrigger, { id: "finish", disabled, className: "quote-style-select h-6 w-full", "aria-label": "Finish choice" }, React.createElement(SelectValue, { placeholder: "Finish" })),
    React.createElement(
      SelectContent,
      null,
      React.createElement(SelectLabel, null, "Finish"),
      ...Array.from({ length: count }, (_, index) => React.createElement(SelectItem, { key: index, value: index ? `choice-${index}` : "one", disabled: index === 1 }, index ? `Choice ${index}` : "One")),
    ),
  );
  return renderToStaticMarkup(quick ? React.createElement(SelectQuickButtonsProvider, { collapseSelected }, root) : root);
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
    expect(html).toContain("disabled=\"\"");
    expect(quickSelectInteraction({ expanded: true, query: "old" }, { type: "query", query: "new" })).toEqual({ expanded: true, query: "new" });
  });

  it("collapses only when opted in and keeps the label and accessible expansion cue", () => {
    const html = example(true, false, 3, true);
    expect((html.match(/<button/g) || [])).toHaveLength(1);
    expect(html).toContain(">Finish</div>");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("One selected. Show choices");
  });

  it("opens missing values and models reopen/select without firing a reopen change", () => {
    const missing = example(true, false, 3, true, "missing");
    expect((missing.match(/<button/g) || [])).toHaveLength(3);
    let state = quickSelectInteraction({ expanded: false, query: "needle" }, { type: "sync", collapseSelected: true, validValue: false });
    expect(state).toEqual({ expanded: true, query: "" });
    const reopened = quickSelectChoice({ expanded: false, query: "old" }, true, true);
    expect(reopened).toEqual({ state: { expanded: true, query: "" }, notifyChange: false });
    const changed = quickSelectChoice(reopened.state, false, true);
    expect(changed).toEqual({ state: { expanded: false, query: "" }, notifyChange: true });
    const same = quickSelectChoice(reopened.state, true, true);
    expect(same).toEqual({ state: { expanded: false, query: "" }, notifyChange: false });
  });

});
