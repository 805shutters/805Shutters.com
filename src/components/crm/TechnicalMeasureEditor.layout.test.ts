import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technical measure mobile controls", () => {
  it("keeps desktop measure viewing in the desktop CRM workspace", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const desktopPage = readFileSync("src/app/crm/measure/[id]/page.tsx", "utf8");
    expect(desktopPage).toContain('workspace="desktop"');
    expect(component).toContain('aria-label="Desktop CRM workspace"');
    expect(component).toContain('desktopWorkspace ? "/crm" : "/crm/mobile"');
    expect(component).toContain('desktopWorkspace ? "desktop CRM" : "mobile dashboard"');
  });
  it("uses compact paired dimensions and push-button choices", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).not.toContain("technical-measure-stepper");
    expect(component).toContain("technical-measure-choice-grid");
    expect(component).toContain("SHUTTER_PANEL_CONFIGS");
    expect(component.match(/showDirectEntry={false}/g)).toHaveLength(3);
    expect(styles).toContain(".technical-measure-dimensions { grid-template-columns: 1fr 1fr; }");
    expect(component).toContain('aria-label="Select width"');
    expect(component).toContain('aria-label="Select height"');
    expect(component).toContain('<span aria-hidden="true">W</span>');
    expect(component).toContain('<span aria-hidden="true">H</span>');
    expect(component).toContain(">WS</button>");
    expect(component).toContain(">F2F</button>");
    expect(styles).toContain("technical-measure-dimensions--with-basis");
    expect(styles).toContain("border-radius: 7px;");
    expect(styles).toContain("min-height: 42px;");
    expect(component.indexOf('aria-label="Select width"')).toBeLessThan(component.indexOf('aria-label="Select height"'));
    expect(component.indexOf('aria-label="Select height"')).toBeLessThan(component.indexOf('className="technical-measure-dimension-basis"'));
  });

  it("continues from width fraction directly into height selection", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");

    expect(component).toContain('setMeasurePicker({ ...measurePicker, step: "height_whole" })');
    expect(component).toContain('setFuturePicker("height_whole")');
    expect(component).toContain("onHeightFraction={(fraction) => { updateLine");
    expect(component).toContain("setMeasurePicker(null); }}");
    expect(component).toContain("onHeightFraction={(fraction) => { setFutureMeasure");
    expect(component).toContain("setFuturePicker(null); }}");
  });

  it("shows completion feedback and returns successful measures to the mobile dashboard", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain('setMessage("Measure submitted")');
    expect(component).toContain("setSubmitSuccess(true)");
    expect(component).toContain("window.location.assign(workspaceHome)");
    expect(component).toContain('desktopWorkspace ? "/crm" : "/crm/mobile"');
    expect(component).toContain("technical-measure-submit-success");
    expect(component).toContain('desktopWorkspace ? "desktop CRM" : "mobile dashboard"');
    expect(component).toContain("technical-measure-alert--active");
    expect(component).toContain("setMeasureStarted(false)");
    expect(styles).toContain(".technical-measure-submit-success");
    expect(styles).toContain(".technical-measure-alert--active");
  });

  it("keeps incomplete-sheet guidance non-blocking during submission", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const service = readFileSync("src/lib/crm/technical-measures.ts", "utf8");

    expect(component).toContain("Optional quality check");
    expect(component).toContain("Incomplete fields do not prevent submission.");
    expect(component).toContain("You can still complete and submit this measure.");
    expect(component).not.toContain("setMessage(compactTechnicalMeasureCompletionSummary(issues));\n        return;");
    expect(service).not.toContain("validateNormanRollerMeasureForSubmission(form)");
    expect(service).not.toContain("technicalMeasureCompletionIssues(form)");
  });

  it("uses a customer launch screen and one-line mobile workspace", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain("Start Measure");
    expect(component).toContain("technical-measure-shell--active");
    expect(component).toContain("technical-measure-workspace");
    expect(component).toContain("Return to customer summary");
    expect(component).toContain("Folding direction");
    expect(component).toContain("Window Size");
    expect(component).toContain("Frame-to-Frame Size");
    expect(component).toContain("Split tilt");
    expect(component).toContain("Divider rail");
    expect(component).toContain("Inside Mount");
    expect(component).toContain("Outside Mount");
    expect(component).toContain("Control side");
    expect(component).not.toContain("<summary>More details");
    expect(component).toContain("shutterMeasurementBasis");
    expect(styles).toContain("height: 100dvh;");
    expect(styles).toContain("overflow: hidden;");
  });

  it("uses vendor-specific shutter buttons and pins product and supplier in the header", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const service = readFileSync("src/lib/crm/technical-measures.ts", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain("ONYX_SIZE_TYPES");
    expect(component).toContain("ONYX_PANEL_CONFIGS");
    expect(component).toContain("SHUTTER_PANEL_CONFIGS");
    expect(component).toContain("ONYX_TILT_TYPES");
    expect(component).toContain("SHUTTER_TILT_TYPES");
    expect(component).toContain("singleDimensionLabel={locationPicker.label}");
    expect(component).toContain('detailChoice.key === "__panel_config"');
    expect(component).toContain('detailChoice.key === "__frame_type"');
    expect(component).toContain('detailChoice.key === "__tilt_type"');
    expect(component).toContain("technical-measure-folding-options");
    expect(component).toContain("<span>Frame type</span>");
    expect(component).toContain("<span>Tilt Type</span>");
    expect(component).toContain("shutterProduct ? <div");
    expect(component).toContain("productLabel(current.product_id)");
    expect(component).toContain('supplier ? ` (${supplier})` : ""');
    expect(component).toContain('HEADER_DETAIL_KEYS = new Set(["supplier", "manufacturer"])');
    expect(styles).toContain(".technical-measure-line-meta");
    expect(service).toContain("panel_config: details.panel_config");
    expect(service).toContain("legacyOptions = detailRecord(priceBreakdown.optionsJson)");
  });

  it("uses a compact paired room and opening identifier row", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain("technical-measure-opening-row");
    expect(component).toContain('aria-label="Opening identifier"');
    expect(component).toContain('OPENING_LABELS = ["A", "B", "C", "D"]');
    expect(component).toContain("OPENING_LABELS.map");
    expect(component).toContain(">Custom</button>");
    expect(component).toContain('aria-label="Custom opening identifier"');
    expect(component).toContain('placeholder="Enter custom opening"');
    expect(component).toContain("customOpeningLineId");
    expect(component).not.toContain('placeholder="A, B, 1, 2…"');
    expect(styles).toContain(".technical-measure-opening-row");
    expect(styles).toContain("grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);");
    expect(styles).toContain(".technical-measure-opening-choice");
    expect(styles).toContain(".technical-measure-opening-custom-button");
    expect(styles).toContain("grid-column: span 2;");
  });

  it("offers durable future measures through the customer-file API", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const api = readFileSync(
      "src/app/api/crm/technical-measures/[id]/future-measures/route.ts",
      "utf8",
    );
    const service = readFileSync("src/lib/crm/technical-measures.ts", "utf8");

    expect(component).toContain("Add Future Measure");
    expect(component).toContain("Save to Customer File");
    expect(api).toContain("addFutureMeasure");
    expect(service).toContain('external_source: "technical_measure_future_folder"');
    expect(service).toContain('title: `Future Measures (${entries.length})`');
  });

  it("offers an authenticated manufacturer-order backfill for submitted historical measures", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const api = readFileSync(
      "src/app/api/crm/technical-measures/[id]/vendor-order-backfill/route.ts",
      "utf8",
    );
    const service = readFileSync("src/lib/crm/technical-measures.ts", "utf8");

    expect(component).toContain("Queue Manufacturer Orders");
    expect(component).toContain("Rebuild Manufacturer Orders");
    expect(component).toContain("queuedLineCount !== lines.length");
    expect(component).toContain("JSON.stringify({ force })");
    expect(component).toContain("/vendor-order-backfill");
    expect(api).toContain("requireCrmUser");
    expect(api).toContain("body.force === true");
    expect(api).toContain("backfillSubmittedVendorOrderPreparation");
    expect(service).toContain("options: { force?: boolean } = {}");
    expect(service).toContain('action: "technical_measure.vendor_order_backfill"');
  });

  it("separates scheduling work and exposes customer contact and map actions", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const api = readFileSync(
      "src/app/api/crm/technical-measures/[id]/schedule/route.ts",
      "utf8",
    );
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain("<h2>Needs Scheduling</h2>");
    expect(component).toContain("<h2>Scheduled</h2>");
    expect(component).toContain("https://www.google.com/maps/search/?api=1&query=");
    expect(component).toContain('href={`tel:${phone}`}');
    expect(component).toContain('href={`sms:${phone}`}');
    expect(component).toContain("Mark Scheduled");
    expect(api).toContain("setTechnicalMeasureSchedulingStatus");
    expect(styles).toContain(".technical-measure-queue-actions");
  });

  it("labels contracted quantities as separate per-window measure lines", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");

    expect(component).toContain("Window ${line.source_quantity_index} of ${line.source_quantity}");
    expect(component).not.toContain("<span>Quantity</span>");
    expect(component).not.toContain('aria-label="Increase quantity"');
    expect(component).not.toContain('aria-label="Decrease quantity"');
    expect(component).toContain("Add Future Measure");
  });
});
