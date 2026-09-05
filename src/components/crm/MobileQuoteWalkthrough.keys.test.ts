import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MobileQuoteWalkthrough.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./MobileQuoteWalkthrough.module.css", import.meta.url), "utf8");
const activeEditorSource = source.slice(source.indexOf("const measurementEditor ="), source.indexOf("return <QueryClientProvider"));

describe("mobile quote active editor identity", () => {
  it("mounts one room editor with a role-specific key distinct from the keypad across saves", () => {
    expect(activeEditorSource.match(/<MobileRoomSelector\b/g)).toHaveLength(1);
    expect(activeEditorSource.match(/<MobileMeasurementKeypad\b/g)).toHaveLength(1);
    expect(activeEditorSource).toContain("key={`room-editor:${draft.id}:${active.id}`}");
    expect(activeEditorSource).toContain("key={`measurement-keypad:${draft.id}:${active.id}`}");
    expect(activeEditorSource).not.toMatch(/key=\{`\$\{draft\.id\}:\$\{active\.id\}`\}/);
  });

  it("renders the compact saved stack once and removes the verbose measure-first list", () => {
    expect(source.match(/const confirmedStack =/g)).toHaveLength(1);
    expect(source).toContain("line.id !== active.id && line.saved");
    expect(source).toContain("validateMobileQuoteMeasurement(line)");
    expect(source).toContain('family?.productType || "Unassigned"');
    expect(source).not.toContain("Unfinished opening");
    expect(source).toContain('onClick={() => setScreen("review")}');
  });

  it("uses the app container for readable two-row phone summaries", () => {
    expect(styles).toContain("container-type:inline-size");
    expect(styles).toContain("@container(max-width:520px)");
    expect(styles).toContain(".confirmedRow>strong{font-size:13px}");
    expect(styles).toContain(".confirmedRow>span{font-size:12px");
    expect(styles).toContain(".confirmedRow>span:last-child{overflow:visible;text-overflow:clip;white-space:normal");
    expect(styles).toContain(".confirmedNumber{grid-row:1/3}");
  });
});
