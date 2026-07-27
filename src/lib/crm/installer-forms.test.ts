import { describe, expect, it } from "vitest";
import {
  buildInstallerFormPdf,
  calculateInstallerCod,
  installerWorkflowFromMeta,
  type InstallerFormRow,
} from "./installer-forms";

describe("installer COD adjustment", () => {
  it("withholds half of each unique not-installed line item", () => {
    expect(calculateInstallerCod(
      1800,
      [{ id: "a", lineTotal: 1000 }, { id: "b", lineTotal: 600 }, { id: "c", lineTotal: 2000 }],
      [
        { lineId: "a", notInstalled: true },
        { lineId: "a", notInstalled: true },
        { lineId: "b", notInstalled: false },
      ],
    )).toEqual({ withheld: 500, adjusted: 1300 });
  });

  it("never produces a negative COD", () => {
    expect(calculateInstallerCod(
      300,
      [{ id: "a", lineTotal: 1000 }],
      [{ lineId: "a", notInstalled: true }],
    )).toEqual({ withheld: 500, adjusted: 0 });
  });
});

describe("805 Shutters Installation Form PDF", () => {
  it("contains customer and line-item details without line-item prices", () => {
    const form: InstallerFormRow = {
      id: "form-1",
      quote_id: "quote-1",
      job_id: "job-1",
      public_token: "secret",
      status: "sent",
      customer_snapshot: {
        name: "Jane Customer",
        address: "123 Main Street",
        phone: "805-555-0101",
        email: "jane@example.com",
        quoteNumber: "805-0200",
      },
      line_snapshot: [{
        id: "line-1",
        room: "Living Room",
        productName: "Plantation Shutter",
        styleName: "Woodlore Plus",
        options: ["Width x Height: 36 x 48", "Color: Silk White"],
        quantity: 1,
        lineTotal: 1234.56,
      }],
      cod_original: 1500,
      cod_adjusted: 1500,
      cod_withheld: 0,
      issues: [],
      accepted: false,
      signer_name: null,
      signed_at: null,
      meta: {},
    };
    const raw = buildInstallerFormPdf(form, "https://805shutters.com/installer-form/secret").toString("latin1");
    expect(raw).toContain("805 SHUTTERS INSTALLATION FORM");
    expect(raw).toContain("Living Room");
    expect(raw).toContain("Width x Height: 36 x 48");
    expect(raw).toContain("JOB OUTCOME");
    expect(raw).toContain("Open the editable technician workflow");
    expect(raw).not.toContain("1234.56");
    expect(raw).not.toContain("1500.00");
  });
});

describe("editable installer workflow state", () => {
  it("loads a persisted technician outcome and revision", () => {
    expect(installerWorkflowFromMeta({
      status: "partially_installed",
      issues: [{ lineId: "line-1", notInstalled: true, details: "Missing bracket" }],
      meta: {
        workflow: {
          outcome: "incomplete",
          reasonCode: "missing_product",
          notes: "Return with replacement bracket.",
          revision: 3,
          updatedAt: "2026-07-27T01:00:00.000Z",
        },
      },
    })).toEqual({
      outcome: "incomplete",
      reasonCode: "missing_product",
      notes: "Return with replacement bracket.",
      revision: 3,
      updatedAt: "2026-07-27T01:00:00.000Z",
    });
  });

  it("falls back safely for pre-workflow installer rows", () => {
    expect(installerWorkflowFromMeta({
      status: "partially_installed",
      issues: [{ lineId: "line-1", notInstalled: true, details: "" }],
      meta: {},
    }).outcome).toBe("partially_completed");
  });
});
