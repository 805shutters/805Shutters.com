/** A changed power source cannot retain its former electrical connection. */
export function clearNormanMotorPowerConnection(options: Record<string, unknown>): Record<string, unknown> {
  return { ...options, dc_power_supply: null, shared_power_panel_id: null, motorization_selections: null };
}
