import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technical measure mobile controls", () => {
  it("uses compact paired dimensions and push-button choices", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain("technical-measure-stepper");
    expect(component).toContain("technical-measure-choice-grid");
    expect(component).toContain("PRODUCT_TYPES.map");
    expect(component.match(/showDirectEntry={false}/g)).toHaveLength(2);
    expect(styles).toContain(".technical-measure-dimensions { grid-template-columns: 1fr 1fr; }");
    expect(styles).toContain("min-height: 58px;");
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

  it("uses a customer launch screen and one-line mobile workspace", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain("Start Measure");
    expect(component).toContain("technical-measure-shell--active");
    expect(component).toContain("technical-measure-workspace");
    expect(component).toContain("Return to customer summary");
    expect(component).toContain("Folding direction");
    expect(component).toContain("Window Size");
    expect(component).toContain("Frame to Frame");
    expect(component).toContain("Split tilt location");
    expect(component).toContain("Divider rail location");
    expect(component).toContain("Inside Mount");
    expect(component).toContain("Outside Mount");
    expect(component).toContain("Control side");
    expect(component).not.toContain("<summary>More details");
    expect(component).toContain("shutterMeasurementBasis");
    expect(styles).toContain("height: 100dvh;");
    expect(styles).toContain("overflow: hidden;");
  });

  it("uses a compact paired room and opening identifier row", () => {
    const component = readFileSync("src/components/crm/TechnicalMeasureEditor.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain("technical-measure-opening-row");
    expect(component).toContain('aria-label="Opening identifier"');
    expect(component).toContain('placeholder="A, B, 1, 2…"');
    expect(styles).toContain(".technical-measure-opening-row");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
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
    expect(component).toContain("disabled={readOnly || isExpandedWindow}");
  });
});
