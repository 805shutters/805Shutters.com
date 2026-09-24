// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfTextBuffer } from "./pdf-text";

describe("server invoice PDF extraction", () => {
  it("extracts a real multipage PDF including the final total without browser globals", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let page = 0; page < 5; page++) {
      pdf.addPage().drawText(page === 4 ? "Customer Name: Allied Inventory Systems\nInvoice total: $115.00" : "MTS Installations invoice 837670781", { font, size: 12, x: 30, y: 700 });
    }
    const text = await extractPdfTextBuffer(Buffer.from(await pdf.save()));
    expect(text).toContain("Allied Inventory Systems");
    expect(text).toContain("$115.00");
  });
  it("rejects broken attachments rather than reporting empty success", async () => {
    await expect(extractPdfTextBuffer(Buffer.from("broken PDF"))).rejects.toThrow();
  });
});
