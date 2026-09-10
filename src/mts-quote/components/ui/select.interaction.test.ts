// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Select, SelectContent, SelectItem, SelectQuickButtonsProvider, SelectTrigger } from "./select";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const containers: HTMLElement[] = [];
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); for (const node of containers.splice(0)) node.remove(); });

describe("quick selection filtering", () => {
  it.each([undefined, "no-longer-in-catalog"])("filters before a valid selection exists (%s)", async (value) => {
    const container = document.createElement("div"); document.body.append(container); containers.push(container);
    const root = createRoot(container); roots.push(root);
    await act(() => root.render(React.createElement(SelectQuickButtonsProvider, { collapseSelected: true },
      React.createElement(Select, { defaultValue: value },
        React.createElement(SelectTrigger, { "aria-label": "Fabric" }),
        React.createElement(SelectContent, null, ...Array.from({ length: 15 }, (_, index) =>
          React.createElement(SelectItem, { value: `fabric-${index}`, key: index }, "Fabric ", index)))))));
    const search = container.querySelector("input")!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "Fabric 12");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(search.value).toBe("Fabric 12");
    expect([...container.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Fabric 12"]);
    await act(() => container.querySelector("button")!.click());
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe("Fabric 12");
    expect(container.querySelector("input")).toBeNull();
  });
});
