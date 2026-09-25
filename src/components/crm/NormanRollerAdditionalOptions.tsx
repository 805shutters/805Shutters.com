"use client";

import type { SalesQuoteDesign } from "@mts/types/quote";
import { NormanRollerHardwareOptions } from "./NormanRollerHardwareOptions";
import { NormanRollerAccessoriesOptions } from "./NormanRollerAccessoriesOptions";
import { NormanRollerChainOptions } from "./NormanRollerChainOptions";
import { NormanRollerPoleOptions } from "./NormanRollerPoleOptions";
import { NormanRollerLightGuardOptions } from "./NormanRollerLightGuardOptions";
import { ROLLER_HARDWARE_KEY, parseRollerHardware } from "@/lib/quote/norman-roller-hardware";
import { ROLLER_ACCESSORY_KEY, parseRollerAccessories } from "@/lib/quote/norman-roller-accessories";
import { ROLLER_CHAIN_KEY, parseRollerChain } from "@/lib/quote/norman-roller-chain";
import { ROLLER_POLE_KEY, parseRollerPole } from "@/lib/quote/norman-roller-poles";
import { ROLLER_LIGHT_GUARD_KEY, parseRollerLightGuard } from "@/lib/quote/norman-roller-light-guard";
import styles from "./NormanRollerAdditionalOptions.module.css";

export function rollerAdditionalDetails(design: SalesQuoteDesign | undefined): string[] {
  const options = design?.options_json ?? {};
  const hardware = parseRollerHardware(options[ROLLER_HARDWARE_KEY]);
  const accessories = parseRollerAccessories(options[ROLLER_ACCESSORY_KEY]);
  const chain = parseRollerChain(options[ROLLER_CHAIN_KEY]);
  const pole = parseRollerPole(options[ROLLER_POLE_KEY]);
  const guard = parseRollerLightGuard(options[ROLLER_LIGHT_GUARD_KEY]);
  const details: string[] = [];
  if (hardware?.shimLayers) details.push(`${hardware.shimLayers} shim layer${hardware.shimLayers === 1 ? "" : "s"}`);
  if (hardware?.raceway) details.push("Raceway");
  if (accessories && accessories.holdDown !== "None") details.push(`${accessories.holdDown} hold-downs${accessories.holdDown === "Magnetic" ? ` · ${accessories.magnetColor}` : ""}`);
  if (chain) details.push(`${chain.material} chain${chain.material === "Plastic" ? ` · ${chain.color}` : ""}${chain.lengthMode === "Custom" ? ` · ${chain.customLength ?? "—"}″` : ""}`);
  if (pole && pole.kind !== "None") details.push(`${pole.kind} × ${pole.quantityPerAssembly}`);
  if (guard && guard.kind !== "None") details.push(`${guard.kind} Light Guard${guard.color ? ` · ${guard.color}` : ""}`);
  return details;
}

export function NormanRollerAdditionalOptions({ design, onUpdateFields }: {
  design: SalesQuoteDesign | undefined;
  onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const details = rollerAdditionalDetails(design);
  return <details className={styles.options}>
    <summary>
      <span>Hardware &amp; accessories</span>
      {details.length > 0 && <span className={styles.selected}>{details.join(" / ")}</span>}
    </summary>
    <div className={styles.fields}>
      <NormanRollerHardwareOptions pricingOnly design={design} onUpdateFields={onUpdateFields} />
      <NormanRollerAccessoriesOptions pricingOnly design={design} onUpdateFields={onUpdateFields} />
      <NormanRollerChainOptions pricingOnly design={design} onUpdateFields={onUpdateFields} />
      <NormanRollerPoleOptions pricingOnly design={design} onUpdateFields={onUpdateFields} />
      <NormanRollerLightGuardOptions design={design} onUpdateFields={onUpdateFields} />
    </div>
  </details>;
}
