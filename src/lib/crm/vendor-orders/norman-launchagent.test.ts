import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const installer = fs.readFileSync(
  path.join(root, "scripts/install-norman-order-draft-launchagent.sh"),
  "utf8",
);

describe("local Chrome ordering agent", () => {
  it("disables the legacy background poller and launch bridge", () => {
    expect(installer).toContain("com.805shutters.norman-order-drafts");
    expect(installer).toContain("com.805shutters.norman-order-bridge");
    expect(installer).toContain("launchctl bootout");
    expect(installer).toContain("DisabledLaunchAgents");
  });

  it("does not start a dedicated debuggable Chrome profile", () => {
    expect(installer).toContain("com.805shutters.norman-order-chrome");
    expect(installer).not.toContain("--remote-debugging-port=9222");
    expect(installer).not.toContain("NormanChrome");
    expect(installer).toContain("existing Chrome profile");
    expect(installer).not.toMatch(/NORMAN_(?:USERNAME|PASSWORD)/);
  });
});
