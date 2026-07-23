import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile workspace exit", () => {
  it("returns nested mobile and technical-measure workspaces to the mobile home", () => {
    const component = readFileSync("src/components/crm/MobileWorkspaceExit.tsx", "utf8");
    const mobileLayout = readFileSync("src/app/crm/mobile/layout.tsx", "utf8");
    const measureLayout = readFileSync("src/app/crm/technical-measures/layout.tsx", "utf8");

    expect(component).toContain('href="/crm/mobile"');
    expect(component).toContain('pathname === "/crm/mobile"');
    expect(component).toContain("Close workspace and return to mobile app home");
    expect(mobileLayout).toContain("<MobileWorkspaceExit />");
    expect(measureLayout).toContain("<MobileWorkspaceExit showOnHome />");
  });
});
