"use client";

import { useMemo, useState } from "react";
import {
  FAUX_WOOD_PRICING,
  FAUX_WOOD_SURCHARGES,
  HONEYCOMB_PRICING,
  HONEYCOMB_SURCHARGES,
  MOTORIZATION_OPTIONS,
  NORMAN_SHUTTER_PROGRAMS,
  ONYX_RETAIL_MULTIPLIER,
  ONYX_SHUTTER_FIXED_SURCHARGES,
  ONYX_SHUTTER_PERCENTAGE_SURCHARGES,
  ONYX_SHUTTER_PROGRAMS,
  PERFECTSHEER_PRICING,
  PERFECTSHEER_SURCHARGES,
  ROLLER_MOTORIZATION,
  ROLLER_PRICING,
  ROLLER_SURCHARGES,
  ROMAN_PRICING,
  ROMAN_SURCHARGES,
  SHUTTER_FIXED_SURCHARGES,
  SHUTTER_PERCENTAGE_SURCHARGES,
  SMARTDRAPE_PRICING,
  SMARTDRAPE_SURCHARGES,
  VERTICAL_PRICING,
  VERTICAL_SURCHARGES,
  WOOD_BLIND_SURCHARGES,
  WOOD_BLINDS_PRICING,
  type MotorOption,
  type PriceGrid,
  type RollerMotorizationSystem,
  type ShutterProgram,
  type Surcharge
} from "@/lib/crm/pricing-data";

const WHOLESALE_REFERENCE_RATE = 0.3;
const SHUTTER_MINIMUM_SQUARE_FEET = 8;

type PricingTabId =
  | "honeycomb"
  | "roller"
  | "roman"
  | "perfectsheer"
  | "vertical"
  | "fauxwood"
  | "wood"
  | "smartdrape"
  | "norman"
  | "onyx";

type SurchargeGroup = {
  title: string;
  items: Surcharge[];
};

type PricingTabConfig = {
  id: PricingTabId;
  label: string;
  description: string;
  grids?: Record<string, PriceGrid>;
  surchargeGroups?: SurchargeGroup[];
  shutterPrograms?: {
    supplier: string;
    programs: ShutterProgram[];
    note: string;
  };
};

const pricingTabs: PricingTabConfig[] = [
  {
    id: "honeycomb",
    label: "Honeycomb",
    description: "Complete honeycomb shade catalog with every grid exported from MTS.",
    grids: HONEYCOMB_PRICING,
    surchargeGroups: [{ title: "Honeycomb surcharges", items: HONEYCOMB_SURCHARGES }]
  },
  {
    id: "roller",
    label: "Roller",
    description: "Roller and solar roller pricing groups, including cordless and light filtering grids.",
    grids: ROLLER_PRICING,
    surchargeGroups: [{ title: "Roller surcharges", items: ROLLER_SURCHARGES }]
  },
  {
    id: "roman",
    label: "Roman",
    description: "Roman shade groups and service adders.",
    grids: ROMAN_PRICING,
    surchargeGroups: [{ title: "Roman surcharges", items: ROMAN_SURCHARGES }]
  },
  {
    id: "perfectsheer",
    label: "PerfectSheer",
    description: "PerfectSheer pricing, room darkening, light guard, and trim adders.",
    grids: PERFECTSHEER_PRICING,
    surchargeGroups: [{ title: "PerfectSheer surcharges", items: PERFECTSHEER_SURCHARGES }]
  },
  {
    id: "vertical",
    label: "Vertical",
    description: "Vertical blind pricing groups and vane/control surcharges.",
    grids: VERTICAL_PRICING,
    surchargeGroups: [{ title: "Vertical surcharges", items: VERTICAL_SURCHARGES }]
  },
  {
    id: "fauxwood",
    label: "Faux Wood",
    description: "SmartPrivacy and Ultimate faux wood blind pricing.",
    grids: FAUX_WOOD_PRICING,
    surchargeGroups: [{ title: "Faux wood surcharges", items: FAUX_WOOD_SURCHARGES }]
  },
  {
    id: "wood",
    label: "Wood",
    description: "Wood blind price grids and premium color/cut-out adders.",
    grids: WOOD_BLINDS_PRICING,
    surchargeGroups: [{ title: "Wood blind surcharges", items: WOOD_BLIND_SURCHARGES }]
  },
  {
    id: "smartdrape",
    label: "SmartDrape",
    description: "SmartDrape pricing with vane, bracket, and color adders.",
    grids: SMARTDRAPE_PRICING,
    surchargeGroups: [{ title: "SmartDrape surcharges", items: SMARTDRAPE_SURCHARGES }]
  },
  {
    id: "norman",
    label: "Norman",
    description: "Norman shutter programs, shared shutter percentage surcharges, and fixed adders.",
    shutterPrograms: {
      supplier: "Norman",
      programs: NORMAN_SHUTTER_PROGRAMS,
      note: `Minimum ${SHUTTER_MINIMUM_SQUARE_FEET} sqft per shutter order.`
    },
    surchargeGroups: [
      { title: "Shared shutter percentage surcharges", items: SHUTTER_PERCENTAGE_SURCHARGES },
      { title: "Shared shutter fixed surcharges", items: SHUTTER_FIXED_SURCHARGES }
    ]
  },
  {
    id: "onyx",
    label: "Onyx",
    description: "Onyx shutter programs, Onyx-specific adders, and shared shutter surcharge references.",
    shutterPrograms: {
      supplier: "Onyx",
      programs: ONYX_SHUTTER_PROGRAMS,
      note: `Retail uses the imported ${formatNumber(ONYX_RETAIL_MULTIPLIER, 2)}x Onyx multiplier. Minimum ${SHUTTER_MINIMUM_SQUARE_FEET} sqft per shutter order.`
    },
    surchargeGroups: [
      { title: "Onyx percentage and per-sqft surcharges", items: ONYX_SHUTTER_PERCENTAGE_SURCHARGES },
      { title: "Onyx fixed surcharges", items: ONYX_SHUTTER_FIXED_SURCHARGES },
      { title: "Shared shutter percentage surcharges", items: SHUTTER_PERCENTAGE_SURCHARGES },
      { title: "Shared shutter fixed surcharges", items: SHUTTER_FIXED_SURCHARGES }
    ]
  }
];

function formatCurrency(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits
  }).format(value);
}

function formatSurchargeValue(surcharge: Surcharge) {
  if (surcharge.type === "percentage") return `+${formatNumber(surcharge.value, surcharge.value % 1 ? 2 : 0)}%`;
  return formatCurrency(surcharge.value, surcharge.value % 1 ? 2 : 0);
}

function formatWholesaleReference(price: number) {
  return `(${formatCurrency(Math.round(price * WHOLESALE_REFERENCE_RATE))})`;
}

function motorOptionsByBrand(options: MotorOption[]) {
  return options.reduce<Record<string, MotorOption[]>>((acc, option) => {
    acc[option.brand] = acc[option.brand] || [];
    acc[option.brand].push(option);
    return acc;
  }, {});
}

export function CrmPricingGuide() {
  const [activeTab, setActiveTab] = useState<PricingTabId>("honeycomb");
  const activeConfig = pricingTabs.find((tab) => tab.id === activeTab) || pricingTabs[0];

  const summary = useMemo(() => {
    const gridCount = pricingTabs.reduce((count, tab) => count + Object.keys(tab.grids || {}).length, 0);
    const surchargeCount = pricingTabs.reduce(
      (count, tab) => count + (tab.surchargeGroups || []).reduce((groupCount, group) => groupCount + group.items.length, 0),
      0
    );
    const rollerMotorCount = Object.values(ROLLER_MOTORIZATION).reduce(
      (count, system) => count + system.components.length,
      0
    );

    return {
      grids: gridCount,
      shutterPrograms: NORMAN_SHUTTER_PROGRAMS.length + ONYX_SHUTTER_PROGRAMS.length,
      surcharges: surchargeCount,
      motorization: MOTORIZATION_OPTIONS.length + rollerMotorCount
    };
  }, []);

  return (
    <section className="crm-pricing" aria-label="Product pricing guide">
      <header className="crm-pricing-hero">
        <div>
          <p className="eyebrow">Pricing Guide</p>
          <h2>Complete product price book.</h2>
          <p>
            Every product grid, shutter program, surcharge, and motorization entry pulled from the
            MTS CRM pricing source.
          </p>
        </div>
        <dl className="crm-pricing-stats" aria-label="Pricing catalog totals">
          <div>
            <dt>Price Grids</dt>
            <dd>{summary.grids}</dd>
          </div>
          <div>
            <dt>Shutter Programs</dt>
            <dd>{summary.shutterPrograms}</dd>
          </div>
          <div>
            <dt>Surcharge Rows</dt>
            <dd>{summary.surcharges}</dd>
          </div>
          <div>
            <dt>Motorization</dt>
            <dd>{summary.motorization}</dd>
          </div>
        </dl>
      </header>

      <nav className="crm-pricing-tabs" aria-label="Pricing product categories">
        {pricingTabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={activeConfig.id === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <ProductPricingSection config={activeConfig} />
      <MotorizationSection />
    </section>
  );
}

function ProductPricingSection({ config }: { config: PricingTabConfig }) {
  const gridEntries = Object.entries(config.grids || {});

  return (
    <div className="crm-pricing-section">
      <header className="crm-pricing-section-head">
        <div>
          <p className="eyebrow">{config.label}</p>
          <h3>{config.description}</h3>
        </div>
        <span>
          {gridEntries.length
            ? `${gridEntries.length} grids`
            : `${config.shutterPrograms?.programs.length || 0} programs`}
        </span>
      </header>

      {config.shutterPrograms ? <ShutterProgramsPanel {...config.shutterPrograms} /> : null}

      {gridEntries.map(([key, grid]) => (
        <PriceGridPanel key={key} catalogKey={key} grid={grid} />
      ))}

      {(config.surchargeGroups || []).map((group) => (
        <SurchargePanel key={group.title} group={group} />
      ))}
    </div>
  );
}

function PriceGridPanel({ catalogKey, grid }: { catalogKey: string; grid: PriceGrid }) {
  return (
    <article className="crm-pricing-card">
      <header className="crm-pricing-card-head">
        <div>
          <p className="eyebrow">Price Grid</p>
          <h3>{grid.name}</h3>
          <span>Catalog key: {catalogKey}</span>
        </div>
        <dl>
          <div>
            <dt>Max Width</dt>
            <dd>{grid.maxWidth}"</dd>
          </div>
          <div>
            <dt>Max Height</dt>
            <dd>{grid.maxHeight}"</dd>
          </div>
          <div>
            <dt>Fabrics</dt>
            <dd>{grid.fabrics.length}</dd>
          </div>
        </dl>
      </header>

      <div className="crm-pricing-fabrics" aria-label={`${grid.name} fabrics`}>
        {grid.fabrics.map((fabric) => (
          <span key={fabric}>{fabric}</span>
        ))}
      </div>

      <PriceGridTable grid={grid} />
    </article>
  );
}

function PriceGridTable({ grid }: { grid: PriceGrid }) {
  return (
    <div className="crm-pricing-table-wrap">
      <table className="crm-pricing-table">
        <thead>
          <tr>
            <th scope="col">Height / Width</th>
            {grid.widths.map((width) => (
              <th scope="col" key={width}>
                {width}"
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.heights.map((height, heightIndex) => (
            <tr key={height}>
              <th scope="row">{height}"</th>
              {grid.widths.map((width, widthIndex) => {
                const price = grid.prices[heightIndex]?.[widthIndex];
                return (
                  <td key={width}>
                    {price && price > 0 ? (
                      <span>
                        <strong>{formatCurrency(price)}</strong>
                        <em>{formatWholesaleReference(price)}</em>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShutterProgramsPanel({
  supplier,
  programs,
  note
}: {
  supplier: string;
  programs: ShutterProgram[];
  note: string;
}) {
  return (
    <article className="crm-pricing-card">
      <header className="crm-pricing-card-head">
        <div>
          <p className="eyebrow">{supplier} Shutters</p>
          <h3>Per square foot pricing</h3>
          <span>{note}</span>
        </div>
        <dl>
          <div>
            <dt>Programs</dt>
            <dd>{programs.length}</dd>
          </div>
          <div>
            <dt>Minimum</dt>
            <dd>{SHUTTER_MINIMUM_SQUARE_FEET} sqft</dd>
          </div>
        </dl>
      </header>

      <div className="crm-pricing-table-wrap">
        <table className="crm-pricing-table crm-pricing-program-table">
          <thead>
            <tr>
              <th scope="col">Program</th>
              <th scope="col">Wholesale / Sqft</th>
              <th scope="col">Retail / Sqft</th>
              <th scope="col">Tariff</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => (
              <tr key={program.name}>
                <th scope="row">{program.name}</th>
                <td>{formatCurrency(program.wholesalePrice, 2)}</td>
                <td>{formatCurrency(program.retailPrice, 2)}</td>
                <td>{program.tariff ? `${formatNumber(program.tariff)}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function SurchargePanel({ group }: { group: SurchargeGroup }) {
  return (
    <article className="crm-pricing-card">
      <header className="crm-pricing-card-head">
        <div>
          <p className="eyebrow">Surcharges</p>
          <h3>{group.title}</h3>
        </div>
        <dl>
          <div>
            <dt>Rows</dt>
            <dd>{group.items.length}</dd>
          </div>
        </dl>
      </header>
      <div className="crm-pricing-surcharge-grid">
        {group.items.map((surcharge) => (
          <div className="crm-pricing-surcharge" key={`${group.title}-${surcharge.name}`}>
            <span>{surcharge.name}</span>
            <strong>{formatSurchargeValue(surcharge)}</strong>
            {surcharge.applicableTo?.length ? <em>{surcharge.applicableTo.join(", ")}</em> : null}
          </div>
        ))}
      </div>
    </article>
  );
}

function MotorizationSection() {
  const brandGroups = useMemo(() => motorOptionsByBrand(MOTORIZATION_OPTIONS), []);
  const rollerSystems = Object.entries(ROLLER_MOTORIZATION);

  return (
    <article className="crm-pricing-card crm-pricing-motorization">
      <header className="crm-pricing-card-head">
        <div>
          <p className="eyebrow">Motorization</p>
          <h3>Motorization options and roller component systems</h3>
          <span>Imported options are grouped by brand and by roller system.</span>
        </div>
        <dl>
          <div>
            <dt>Brand Options</dt>
            <dd>{MOTORIZATION_OPTIONS.length}</dd>
          </div>
          <div>
            <dt>Roller Systems</dt>
            <dd>{rollerSystems.length}</dd>
          </div>
        </dl>
      </header>

      <div className="crm-pricing-motor-grid">
        {Object.entries(brandGroups).map(([brand, options]) => (
          <MotorGroup key={brand} title={brand} options={options} />
        ))}
      </div>

      <div className="crm-pricing-motor-grid">
        {rollerSystems.map(([key, system]) => (
          <RollerMotorGroup key={key} system={system} />
        ))}
      </div>
    </article>
  );
}

function MotorGroup({ title, options }: { title: string; options: MotorOption[] }) {
  return (
    <section className="crm-pricing-motor-group">
      <header>
        <h4>{title}</h4>
        <span>{options.length} items</span>
      </header>
      <div>
        {options.map((option) => (
          <p key={`${title}-${option.name}`}>
            <span>{option.name}</span>
            <strong>{formatCurrency(option.price)}</strong>
          </p>
        ))}
      </div>
    </section>
  );
}

function RollerMotorGroup({ system }: { system: RollerMotorizationSystem }) {
  return (
    <section className="crm-pricing-motor-group">
      <header>
        <h4>{system.name}</h4>
        <span>{system.components.length} components</span>
      </header>
      <div>
        {system.components.map((component) => (
          <p key={`${system.name}-${component.name}`}>
            <span>{component.name}</span>
            <strong>{formatCurrency(component.price)}</strong>
          </p>
        ))}
      </div>
    </section>
  );
}
