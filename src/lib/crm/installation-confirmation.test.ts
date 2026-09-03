import { describe, expect, it, vi } from "vitest";
import { withInstallationConfirmation } from "./installation-confirmation";

describe("withInstallationConfirmation", () => {
  it("cancels before mutation when staff declines", () => {
    const confirm = vi.fn(() => false);
    const mutate = vi.fn();
    const targets = withInstallationConfirmation(
      "Actual Customer",
      [{ currentStatus: "sold", patch: { status: "installed" } }],
      confirm
    );

    if (targets) mutate(targets);

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Actual Customer"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("installation has been completed"));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("confirms a bundled job and quote installation once and flags both mutations", () => {
    const confirm = vi.fn(() => true);

    const targets = withInstallationConfirmation(
      "Actual Customer",
      [
        { currentStatus: "sold", patch: { status: "installed" } },
        { currentStatus: "received", patch: { status: "installed" } }
      ],
      confirm
    );

    expect(confirm).toHaveBeenCalledOnce();
    expect(targets?.map((target) => target.patch)).toEqual([
      { status: "installed", installation_confirmed: true },
      { status: "installed", installation_confirmed: true }
    ]);
  });

  it("does not show another dialog for already-confirmed bundled persistence", () => {
    const confirm = vi.fn(() => true);
    const targets = withInstallationConfirmation(
      "Actual Customer",
      [
        { currentStatus: "sold", patch: { status: "installed", installation_confirmed: true } },
        { currentStatus: "received", patch: { status: "installed", installation_confirmed: true } }
      ],
      confirm
    );

    expect(confirm).not.toHaveBeenCalled();
    expect(targets).not.toBeNull();
  });

  it("requires confirmation for a manual installation-complete checkbox but not an existing completion", () => {
    const confirm = vi.fn(() => true);

    const newlyComplete = withInstallationConfirmation(
      "Manual Customer",
      [{ installationComplete: false, patch: { installation_complete: true } }],
      confirm
    );
    const alreadyComplete = withInstallationConfirmation(
      "Manual Customer",
      [{ installationComplete: true, patch: { installation_complete: true } }],
      confirm
    );

    expect(confirm).toHaveBeenCalledOnce();
    expect(newlyComplete?.[0].patch).toMatchObject({ installation_confirmed: true });
    expect(alreadyComplete?.[0].patch).toEqual({ installation_complete: true });
  });
});
