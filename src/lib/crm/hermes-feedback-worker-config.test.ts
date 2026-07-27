import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync(
  new URL("../../../scripts/hermes-805-crm-feedback-worker.mjs", import.meta.url),
  "utf8",
);
const installer = readFileSync(
  new URL("../../../scripts/install-hermes-805-crm-feedback-launchagent.sh", import.meta.url),
  "utf8",
);

describe("Hermes 805 feedback worker configuration", () => {
  it("keeps release execution disabled by default", () => {
    expect(worker).toContain('process.env.HERMES_805_RELEASE_ENABLED === "true"');
    expect(worker).not.toContain("HERMES_805_RELEASE_ENABLED: true");
  });

  it("does not write the shared secret into the LaunchAgent", () => {
    expect(installer).not.toContain("<key>HERMES_805_SHARED_SECRET</key>");
    expect(installer).toContain("StartInterval");
  });

  it("uses the default MTS Hermes profile and never the reserved 805 bot", () => {
    expect(worker).not.toContain('"--profile", "shutters805"');
    expect(worker).toContain('`${process.env.HOME}/.hermes/.env`');
    expect(installer).toContain('$HOME/.hermes/logs');
    expect(installer).not.toContain("profiles/shutters805");
  });
});
