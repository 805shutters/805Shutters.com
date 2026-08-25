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
    expect(alertRule).toContain("position: fixed;");
    expect(alertRule).toContain("bottom: 20px;");
    expect(alertRule).toContain("z-index: 120;");
  });

  it("shows an in-button saving state while a CRM action is pending", () => {
    expect(appSource).toContain('const [saving, setSaving] = useState(false);');
    expect(appSource).toContain('aria-busy={saving}');
    expect(appSource).toContain('saving ? "Saving…" : command.label');
    expect(appSource).toContain('await runAction(command.onClick);');
  });
});
