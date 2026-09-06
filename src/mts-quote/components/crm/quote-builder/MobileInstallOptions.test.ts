import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MobileInstallOptions } from "./MobileInstallOptions";

describe("MobileInstallOptions", () => {
  it("renders confirmed No compactly while leaving unknown values unselected", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(createElement(MobileInstallOptions, {
      options: [
        { field: "hard_surface_install", label: "Hard-surface install", value: "No" },
        { field: "requires_takedown", label: "Remove existing treatment", value: null },
      ],
      onChange,
    }));

    expect(html.match(/>No<\/button>/g)).toHaveLength(2);
    expect(html.match(/>Yes<\/button>/g)).toHaveLength(1);
    expect(html).toContain("Hard-surface install: No selected. Show choices");
    expect(html).toContain("Remove existing treatment: choose No");
    expect(html).toContain("Remove existing treatment: choose Yes");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses unique label ids when more than one group is mounted", () => {
    const group = (key: string) => createElement(MobileInstallOptions, {
      key,
      options: [{ field: "ladder_over_15ft", label: "Ladder over 15 ft", value: "No" }],
      onChange: () => undefined,
    });
    const html = renderToStaticMarkup(createElement(Fragment, null, group("first"), group("second")));
    const ids = [...html.matchAll(/id="([^"]+-ladder_over_15ft)"/g)].map((match) => match[1]);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`aria-labelledby="${id}"`);
  });
});
