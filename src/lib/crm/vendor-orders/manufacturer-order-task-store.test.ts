import { describe, expect, it } from "vitest";
import { buildSignedContractVendorOrderPreparations } from "./manufacturer-order-task-store";
import type { AgenticOrderManifest } from "./manufacturer-order-form-registry";

describe("signed-contract manufacturer task fan-out", () => {
  it("creates one task per manufacturer with the same customer identity", () => {
    const manifest: AgenticOrderManifest = {
      coverPage: {
        template: "customer-order-cover-v1",
        customerId: "customer-1",
        quoteId: "quote-1",
        measureStatus: "no_measure",
        authority: "signed_contract",
      },
      releaseStatus: "ready",
      lineItemPages: [
        {
          sourceLineId: "line-1",
          sourceLineNumber: 1,
          quantity: 1,
          routingKey: "norman:roller",
          productName: "Soluna Roller Shades",
          templateUrl: "/order-form-templates/norman.docx",
          templatePdfUrl: "/order-form-templates/norman.pdf",
          schemaUrl: "/order-form-templates/norman.json",
          technicalMeasureTemplateUrl: "/technical-measure-templates/norman.docx",
          technicalMeasureTemplatePdfUrl: "/technical-measure-templates/norman.pdf",
          templateVersion: 1,
          sourceValues: { product_id: "roller", details: { supplier: "Norman" } },
          status: "ready",
          reason: null,
        },
        {
          sourceLineId: "line-2",
          sourceLineNumber: 2,
          quantity: 1,
          routingKey: "onyx:poly_composite",
          productName: "Poly Composite Shutters",
          templateUrl: "/order-form-templates/onyx.docx",
          templatePdfUrl: "/order-form-templates/onyx.pdf",
          schemaUrl: "/order-form-templates/onyx.json",
          technicalMeasureTemplateUrl: "/technical-measure-templates/onyx.docx",
          technicalMeasureTemplatePdfUrl: "/technical-measure-templates/onyx.pdf",
          templateVersion: 1,
          sourceValues: { product_id: "shutter", details: { supplier: "Onyx", material: "Poly Composite" } },
          status: "ready",
          reason: null,
        },
      ],
    };
    const context = {
      sourceKind: "signed_contract" as const,
      sourceId: "contract:quote-1",
      sourceRevision: "signed_contract:quote-1:revision-1",
      technicalMeasureFormId: null,
      jobId: "job-1",
      quoteId: "quote-1",
      customerSnapshot: { id: "customer-1", name: "Jane Customer", phone: "805-555-0100" },
      quoteSnapshot: { quoteNumber: "805-0200", signedAt: "2026-07-27T18:00:00.000Z" },
    };
    const tasks = buildSignedContractVendorOrderPreparations({ manifest, context });
    expect(tasks.map((task) => task.manufacturer)).toEqual(["Norman", "Onyx"]);
    expect(tasks.every((task) => task.status === "queued")).toBe(true);
    expect(tasks.every((task) => task.orderPacketUrl?.includes("format=html"))).toBe(true);
    expect(tasks.every((task) => (
      (task.payload as { customer?: { name?: string } }).customer?.name === "Jane Customer"
    ))).toBe(true);
  });

  it("fails closed when a contract line lacks exact routing", () => {
    const manifest = {
      coverPage: {
        template: "customer-order-cover-v1",
        customerId: "customer-1",
        quoteId: "quote-1",
        measureStatus: "no_measure",
        authority: "signed_contract",
      },
      releaseStatus: "order_review_required",
      lineItemPages: [{
        sourceLineId: "line-1",
        sourceLineNumber: 1,
        quantity: 1,
        routingKey: null,
        productName: null,
        templateUrl: null,
        templatePdfUrl: null,
        schemaUrl: null,
        technicalMeasureTemplateUrl: null,
        technicalMeasureTemplatePdfUrl: null,
        templateVersion: 1,
        sourceValues: { product_id: "unknown" },
        status: "order_review_required",
        reason: "Missing product",
      }],
    } satisfies AgenticOrderManifest;
    expect(() => buildSignedContractVendorOrderPreparations({
      manifest,
      context: {
        sourceKind: "signed_contract",
        sourceId: "contract:quote-1",
        sourceRevision: "revision-1",
        technicalMeasureFormId: null,
        jobId: "job-1",
        quoteId: "quote-1",
        customerSnapshot: { name: "Jane Customer" },
        quoteSnapshot: { quoteNumber: "805-0200" },
      },
    })).toThrow("missing exact manufacturer routing");
  });
});
