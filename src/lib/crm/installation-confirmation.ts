export const INSTALLATION_CONFIRMATION_MESSAGE =
  "Marking installed means the installation has been completed.";

export type InstallationConfirmationTarget = {
  currentStatus?: unknown;
  installationComplete?: boolean;
  patch: Record<string, unknown>;
};

type ConfirmInstallation = (message: string) => boolean;

function targetNeedsInstallationConfirmation(target: InstallationConfirmationTarget) {
  return (
    (target.patch.status === "installed" && target.currentStatus !== "installed") ||
    (target.patch.installation_complete === true && target.installationComplete !== true)
  );
}

function isInstallationCompletionTarget(target: InstallationConfirmationTarget) {
  return target.patch.status === "installed" || target.patch.installation_complete === true;
}

export function withInstallationConfirmation(
  customerName: string,
  targets: InstallationConfirmationTarget[],
  confirm: ConfirmInstallation = (message) => window.confirm(message)
): InstallationConfirmationTarget[] | null {
  const protectedTargets = targets.filter(targetNeedsInstallationConfirmation);
  if (!protectedTargets.length || protectedTargets.every((target) => target.patch.installation_confirmed === true)) {
    return targets;
  }

  const name = customerName.trim() || "this customer";
  if (!confirm(`Confirm installation is complete for ${name}. ${INSTALLATION_CONFIRMATION_MESSAGE}`)) return null;

  return targets.map((target) =>
    isInstallationCompletionTarget(target)
      ? { ...target, patch: { ...target.patch, installation_confirmed: true } }
      : target
  );
}
