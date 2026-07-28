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

  it("loads only the dedicated 805 shared secret from Keychain", () => {
    expect(worker).toContain('"hermes-805-shared-secret"');
    expect(worker).toContain('"hermes-805"');
    expect(worker).not.toContain('"hermes-mts-shared-secret"');
  });

  it("uses only the isolated 805 Hermes profile", () => {
    expect(worker).toContain('HERMES_HOME: profileHome');
    expect(worker).toContain('`${process.env.HOME}/.hermes/profiles/shutters805seo`');
    expect(worker).not.toContain('"--profile"');
    expect(worker).not.toContain('"--source"');
    expect(worker).toContain('`${process.env.HOME}/.hermes/profiles/shutters805seo/.env`');
    expect(worker).not.toContain("HERMES_MTS_WORKSPACE");
    expect(worker).not.toContain("HERMES_MTS_ENV_FILE");
    expect(installer).toContain("$HOME/.hermes/profiles/shutters805seo/logs");
  });
});
