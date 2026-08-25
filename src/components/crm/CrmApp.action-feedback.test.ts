import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("./CrmApp.tsx", import.meta.url)), "utf8");
const globalStyles = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

describe("CRM action feedback", () => {
  it("announces action results and keeps them visible beside scrolled controls", () => {
    expect(appSource).toMatch(
      /<p className="crm-alert" role="status" aria-live="polite" aria-atomic="true">/,
    );

    const alertRule = globalStyles.match(/(?:^|\n)\.crm-alert \{([\s\S]*?)\n\}/)?.[1] || "";
    expect(alertRule).toContain("position: sticky;");
    expect(alertRule).toContain("top: 12px;");
    expect(alertRule).toContain("z-index: 80;");
  });
});
