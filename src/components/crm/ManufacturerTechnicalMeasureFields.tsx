"use client";

import type { CrmQuoteDetailValue } from "@/lib/crm/types";
import type { TechnicalMeasureLineValues } from "@/lib/crm/technical-measures";
import type {
  ManufacturerTechnicalMeasureField,
  ManufacturerTechnicalMeasureSchema,
  TechnicalMeasureFieldSection,
} from "@/lib/crm/vendor-orders/manufacturer-technical-measure-schemas";

type DetailRecord = Record<string, CrmQuoteDetailValue>;

type Props = {
  schema: ManufacturerTechnicalMeasureSchema;
  values: TechnicalMeasureLineValues;
  disabled: boolean;
  onDetail: (key: string, value: string | boolean) => void;
};

const SECTION_ORDER: TechnicalMeasureFieldSection[] = [
  "opening",
  "product",
  "operation",
  "hardware",
  "motorization",
  "installation",
];

const SECTION_LABELS: Record<TechnicalMeasureFieldSection, string> = {
  opening: "Opening and placement",
  product: "Product selections",
  operation: "Operation",
  hardware: "Hardware and finish",
  motorization: "Motorization and controls",
  installation: "Installation conditions",
};

const FIELD_VALUE_ALIASES: Record<string, string[]> = {
  collection: ["fabric_collection", "fabric_color_collection"],
  color: ["color_name", "fabric_color", "fabric_color_name"],
  color_code: ["fabric_code", "fabric_color_code"],
  color_name: ["fabric_color", "fabric_color_name", "color"],
  fabric_code: ["fabric_color_code", "color_code"],
  fabric_collection: ["fabric_color_collection", "collection"],
  fabric_color: ["fabric_color_name", "color_name", "color"],
  fabric_name: ["fabric_color_name", "color_name", "color"],
  fabric_style: ["pattern_style"],
  material_collection: ["collection", "fabric_collection"],
  pattern_style: ["fabric_style"],
  side_mark_po: ["opening_label"],
};

function detailValue(details: DetailRecord, key: string): string {
  const item = details[key];
  if (typeof item === "string" || typeof item === "number") return String(item);
  return "";
}

function value(values: TechnicalMeasureLineValues, key: string): string {
  const direct = detailValue(values.details, key);
  if (direct) return direct;
  for (const alias of FIELD_VALUE_ALIASES[key] || []) {
    if (alias === "opening_label" && values.opening_label) return values.opening_label;
    const aliased = detailValue(values.details, alias);
    if (aliased) return aliased;
  }
  if (["collection", "fabric_collection", "fabric_name", "fabric_style", "material_collection", "pattern_style"].includes(key)) {
    return values.fabric || values.program_id || "";
  }
  if (key === "product_type") return values.product_id;
  if (["shutter_category", "shutter_type"].includes(key)) return values.program_id || values.fabric || values.product_id;
  return "";
}

function Field({
  field,
  values,
  disabled,
  onDetail,
}: {
  field: ManufacturerTechnicalMeasureField;
  values: TechnicalMeasureLineValues;
  disabled: boolean;
  onDetail: Props["onDetail"];
}) {
  const current = values.details[field.key];
  if (field.input === "boolean") {
    return (
      <div className="technical-measure-quick-field">
        <span>{field.label}{field.required ? " *" : ""}</span>
        <div className="technical-measure-quick-options">
          <button type="button" disabled={disabled} aria-pressed={current === true} onClick={() => onDetail(field.key, true)}>Yes</button>
          <button type="button" disabled={disabled} aria-pressed={current === false} onClick={() => onDetail(field.key, false)}>No</button>
        </div>
      </div>
    );
  }
  if (field.input === "choice" && field.options?.length) {
    return (
      <label>
        <span>{field.label}{field.required ? " *" : ""}</span>
        <select disabled={disabled} value={value(values, field.key)} onChange={(event) => onDetail(field.key, event.target.value)}>
          <option value="">Select</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  if (field.input === "long_text") {
    return (
      <label className="technical-measure-vendor-wide">
        <span>{field.label}{field.required ? " *" : ""}</span>
        <textarea disabled={disabled} rows={3} value={value(values, field.key)} onChange={(event) => onDetail(field.key, event.target.value)} onBlur={(event) => onDetail(field.key, event.target.value)} />
      </label>
    );
  }
  return (
    <label>
      <span>{field.label}{field.required ? " *" : ""}</span>
      <input
        disabled={disabled}
        inputMode={field.input === "dimension" || field.input === "integer" ? "decimal" : undefined}
        type="text"
        placeholder={field.input === "dimension" ? "Inches" : undefined}
        value={value(values, field.key)}
        onChange={(event) => onDetail(field.key, event.target.value)}
        onBlur={(event) => onDetail(field.key, event.target.value)}
      />
    </label>
  );
}

export function ManufacturerTechnicalMeasureFields({ schema, values, disabled, onDetail }: Props) {
  return (
    <fieldset className="technical-measure-vendor-fields technical-measure-schema-fields">
      <legend><span>{schema.manufacturer} ordering sequence</span>{schema.productName}</legend>
      <p>
        These fields follow the dedicated {schema.productName} ordering schema. Complete every applicable field;
        use N/A only when the manufacturer option does not apply.
      </p>
      <div className="technical-measure-schema-route">
        <span>Routing key</span><strong>{schema.routingKey}</strong>
      </div>
      {SECTION_ORDER.map((section) => {
        const fields = schema.fields.filter((field) =>
          field.section === section && !["mount_type", "control_side"].includes(field.key)
        );
        if (!fields.length) return null;
        return (
          <section className="technical-measure-schema-section" key={section}>
            <h3>{SECTION_LABELS[section]}</h3>
            <div className="technical-measure-vendor-grid">
              {fields.map((field) => (
                <Field key={field.key} field={field} values={values} disabled={disabled} onDetail={onDetail} />
              ))}
            </div>
          </section>
        );
      })}
    </fieldset>
  );
}
