import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const installer = fs.readFileSync(
  path.join(root, "scripts/install-norman-order-draft-launchagent.sh"),
  "utf8",
);

describe("Norman order launch agents", () => {
  it("installs the automatic poller and the CRM launch bridge", () => {
    expect(installer).toContain("com.805shutters.norman-order-drafts");
    expect(installer).toContain("com.805shutters.norman-order-bridge");
    expect(installer).toContain("orders:norman:next");
    expect(installer).toContain("orders:norman:bridge");
    expect(installer).toContain("<key>StartInterval</key><integer>120</integer>");
    expect(installer).toContain("<key>KeepAlive</key><true/>");
    expect(installer).toContain("<key>EnvironmentVariables</key>");
    expect(installer).toContain("<key>PATH</key>");
  });

  it("starts a dedicated debuggable Chrome profile without storing portal credentials", () => {
    expect(installer).toContain("com.805shutters.norman-order-chrome");
    expect(installer).toContain("--remote-debugging-port=9222");
    expect(installer).toContain("NormanChrome");
    expect(installer).not.toMatch(/NORMAN_(?:USERNAME|PASSWORD)/);
  });

  it("fails closed unless the protected worker secret already exists in Keychain", () => {
    expect(installer).toContain("security find-generic-password");
    expect(installer).toContain("805-norman-worker-secret");
  });
});
