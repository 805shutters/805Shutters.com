"use client";

import type { CrmQuoteDetailValue } from "@/lib/crm/types";
import { normanRollerFabricColors } from "@/lib/quote/norman-roller-fabrics";

type DetailRecord = Record<string, CrmQuoteDetailValue>;

type Props = {
  details: DetailRecord;
  disabled: boolean;
  onDetail: (key: string, value: string | boolean) => void;
  onFabric: (value: { fabric: string; programId: string | null }) => void;
};

export const NORMAN_ROLLER_MEASURE_DETAIL_KEYS = new Set([
  "supplier", "window_type", "installation_location", "mount_type", "shade_type",
  "fabric_color_type", "fabric_color_collection", "fabric_color_code", "fabric_color_name",
  "lift_system", "hem_bar", "valance", "roll_type", "chain_type", "control_side",
  "chain_length_type", "chain_length_in", "motor_type", "remote_type", "remote_quantity",
  "remote_channel", "hub_quantity", "wall_switch_quantity", "solar_panel_quantity",
  "power_location", "valance_finish", "valance_return_depth", "bracket_type", "hold_downs",
  "hold_down_color", "fabric_direction", "fabric_join_confirmed", "light_guard", "raceway",
  "motor_accessories_confirmed",
]);

const LIFT_SYSTEMS = ["PrecisionLift Cordless", "Continuous Cord Loop", "Smart Release", "Motorized"];
const VALANCES = [
  "No Valance",
  "No Valance; Will Order Separately",
  "Square Fascia",
  "Plain Curved Fascia",
  "Curved Fascia with Fabric",
  '3 1/2" Fabric Valance',
  '4 1/2" Fabric Valance',
  '6" Fabric Valance',
  '8" Fabric Valance',
  '4 1/2" Modern Wood Valance',
  "Cassette",
];
const MOTOR_TYPES = [
  "Rechargeable Battery with Wireless Charging Wand",
  "Rechargeable Battery with Wired Charging Wand",
  "Rechargeable Battery with AC Adapter Charger",
  "DC Low Voltage Hard Wire",
  "AC Adapter Plug-In",
  "AutoWand",
  "Automate Home Li-Ion ARC Motor (Rechargeable)",
  "Automate Home 12V Low Voltage DC Motor",
];

function value(details: DetailRecord, key: string) {
  const item = details[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : "";
}

function SelectField({ label, field, options, details, disabled, onDetail }: {
  label: string;
  field: string;
  options: string[];
  details: DetailRecord;
  disabled: boolean;
  onDetail: Props["onDetail"];
}) {
  return (
    <label>
      <span>{label}</span>
      <select disabled={disabled} value={value(details, field)} onChange={(event) => onDetail(field, event.target.value)}>
        <option value="">Select</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function NormanRollerMeasureFields({ details, disabled, onDetail, onFabric }: Props) {
  const selectedCode = value(details, "fabric_color_code");
  const liftSystem = value(details, "lift_system");
  const valance = value(details, "valance");
  const chainDriven = liftSystem === "Continuous Cord Loop" || liftSystem === "Smart Release";
  const motorized = liftSystem === "Motorized";
  const needsValanceDetails = valance && !["No Valance", "No Valance; Will Order Separately"].includes(valance);

  return (
    <fieldset className="technical-measure-vendor-fields">
      <legend><span>Norman ordering</span>Roller Shade</legend>
      <p>Required fields are saved with the measure and reordered automatically for Norman. Phase one supports single shades.</p>
      <div className="technical-measure-vendor-grid">
        <SelectField label="Window Type" field="window_type" options={["Single"]} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="Installed On" field="installation_location" options={["Window", "Door"]} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="Mount" field="mount_type" options={["Inside Mount", "Outside Mount"]} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="Shade Type" field="shade_type" options={["Single Shade"]} details={details} disabled={disabled} onDetail={onDetail} />

        <label className="technical-measure-vendor-wide">
          <span>Exact Norman Fabric</span>
          <select
            disabled={disabled}
            value={selectedCode}
            onChange={(event) => {
              const selected = normanRollerFabricColors.find((row) => row.available && row.colorCode === event.target.value);
              if (!selected) return;
              onDetail("supplier", "Norman");
              onDetail("fabric_color_type", selected.fabricType);
              onDetail("fabric_color_collection", selected.collection);
              onDetail("fabric_color_code", selected.colorCode);
              onDetail("fabric_color_name", selected.colorName);
              onFabric({ fabric: selected.collection, programId: selected.programId });
            }}
          >
            <option value="">Select collection, color, and Norman code</option>
            {normanRollerFabricColors.filter((row) => row.available).map((row) => (
              <option key={`${row.collection}-${row.colorCode}`} value={row.colorCode}>
                {row.collection} — {row.colorCode} {row.colorName} ({row.fabricType})
              </option>
            ))}
          </select>
        </label>

        <SelectField label="Lift System" field="lift_system" options={LIFT_SYSTEMS} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="Hem Bar" field="hem_bar" options={["Plain", "External", "Fabric-Wrapped", "Brushed Ebony Finish"]} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="Valance" field="valance" options={VALANCES} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="Fabric Roll" field="roll_type" options={["Standard", "Reverse"]} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="Fabric Direction" field="fabric_direction" options={["Standard", "Railroaded"]} details={details} disabled={disabled} onDetail={onDetail} />
        <label className="technical-measure-vendor-confirm"><input disabled={disabled} type="checkbox" checked={details.fabric_join_confirmed === true} onChange={(event) => onDetail("fabric_join_confirmed", event.target.checked)} /><span>Fabric join requirements reviewed</span></label>

        {chainDriven ? <>
          <SelectField label="Chain Type" field="chain_type" options={["Plastic", "Stainless Steel Chain", "Cordloop with Stainless Steel Chain"]} details={details} disabled={disabled} onDetail={onDetail} />
          <SelectField label="Control Side" field="control_side" options={["Left", "Right"]} details={details} disabled={disabled} onDetail={onDetail} />
          <SelectField label="Chain Length" field="chain_length_type" options={["Standard", "Custom"]} details={details} disabled={disabled} onDetail={onDetail} />
          {value(details, "chain_length_type") === "Custom" ? <label><span>Custom Chain Length (inches)</span><input disabled={disabled} inputMode="decimal" value={value(details, "chain_length_in")} onChange={(event) => onDetail("chain_length_in", event.target.value)} onBlur={(event) => onDetail("chain_length_in", event.target.value)} /></label> : null}
        </> : null}

        {motorized ? <>
          <SelectField label="Motor" field="motor_type" options={MOTOR_TYPES} details={details} disabled={disabled} onDetail={onDetail} />
          <SelectField label="Motor / Control Side" field="control_side" options={["Left", "Right"]} details={details} disabled={disabled} onDetail={onDetail} />
          <label><span>Remote Type</span><input disabled={disabled} value={value(details, "remote_type")} onChange={(event) => onDetail("remote_type", event.target.value)} /></label>
          <label><span>Remote Quantity</span><input disabled={disabled} inputMode="numeric" value={value(details, "remote_quantity")} onChange={(event) => onDetail("remote_quantity", event.target.value)} onBlur={(event) => onDetail("remote_quantity", event.target.value)} /></label>
          <label><span>Remote Channel</span><input disabled={disabled} value={value(details, "remote_channel")} onChange={(event) => onDetail("remote_channel", event.target.value)} /></label>
          <label><span>Hub Quantity</span><input disabled={disabled} inputMode="numeric" value={value(details, "hub_quantity")} onChange={(event) => onDetail("hub_quantity", event.target.value)} onBlur={(event) => onDetail("hub_quantity", event.target.value)} /></label>
          <label><span>Wall Switch Quantity</span><input disabled={disabled} inputMode="numeric" value={value(details, "wall_switch_quantity")} onChange={(event) => onDetail("wall_switch_quantity", event.target.value)} onBlur={(event) => onDetail("wall_switch_quantity", event.target.value)} /></label>
          <label><span>Solar Panel Quantity</span><input disabled={disabled} inputMode="numeric" value={value(details, "solar_panel_quantity")} onChange={(event) => onDetail("solar_panel_quantity", event.target.value)} onBlur={(event) => onDetail("solar_panel_quantity", event.target.value)} /></label>
          <label><span>Charging / Power Location</span><input disabled={disabled} value={value(details, "power_location")} onChange={(event) => onDetail("power_location", event.target.value)} /></label>
          <label className="technical-measure-vendor-confirm"><input disabled={disabled} type="checkbox" checked={details.motor_accessories_confirmed === true} onChange={(event) => onDetail("motor_accessories_confirmed", event.target.checked)} /><span>Motor power, controls, and accessories reviewed</span></label>
        </> : null}

        {needsValanceDetails ? <>
          <label><span>Valance Finish / Color</span><input disabled={disabled} value={value(details, "valance_finish")} onChange={(event) => onDetail("valance_finish", event.target.value)} /></label>
          <label><span>Return Depth</span><input disabled={disabled} value={value(details, "valance_return_depth")} onChange={(event) => onDetail("valance_return_depth", event.target.value)} /></label>
        </> : null}

        <SelectField label="Bracket Type" field="bracket_type" options={["Top Mount Bracket", "Wall/Back Mount Bracket"]} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="Raceway" field="raceway" options={["No", "Yes"]} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="LightGuard 360" field="light_guard" options={["No", "Yes"]} details={details} disabled={disabled} onDetail={onDetail} />
        <SelectField label="Hold Downs" field="hold_downs" options={["No", "Traditional", "Magnetic"]} details={details} disabled={disabled} onDetail={onDetail} />
        {value(details, "hold_downs") === "Magnetic" ? <label><span>Hold Down Color</span><input disabled={disabled} value={value(details, "hold_down_color")} onChange={(event) => onDetail("hold_down_color", event.target.value)} /></label> : null}
      </div>
    </fieldset>
  );
}
