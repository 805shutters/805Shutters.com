import { listProducts } from "@/lib/quote/catalog";
import { priceDealerNetDesign, priceDesign } from "@/lib/quote/pricing";
import { quoteLabProductType } from "./builder";
import type {
  ManufacturerComparisonProduct,
  ManufacturerComparisonResponse,
} from "./types";

export type ManufacturerComparisonInput = {
  productType: string;
  widthInches: number;
  heightInches: number;
  quantity?: number;
  selectedProductId?: string | null;
};

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function compareManufacturers(input: ManufacturerComparisonInput): ManufacturerComparisonResponse {
  const widthInches = Number(input.widthInches);
  const heightInches = Number(input.heightInches);
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  if (!Number.isFinite(widthInches) || widthInches <= 0 || !Number.isFinite(heightInches) || heightInches <= 0) {
    throw new Error("Valid width and height are required for manufacturer comparison.");
  }

  const products: ManufacturerComparisonProduct[] = listProducts()
    .filter((product) => quoteLabProductType(product.id) === input.productType)
    .map((product) => ({
      productId: product.id,
      manufacturer: product.manufacturer ?? "Norman",
      productName: product.name,
      system: product.system ?? null,
      selected: product.id === input.selectedProductId,
      programs: product.programs.map((program) => {
        const priceInput = {
          productId: product.id,
          programId: program.id,
          widthInches,
          heightInches,
          quantity,
          surcharges: [],
          motorization: [],
          discountPercent: 0,
        };

        if (product.priceBasis === "dealer_net" || program.priceBasis === "dealer_net") {
          const result = priceDealerNetDesign(priceInput);
          if (!result.ok) {
            return {
              productId: product.id,
              programId: program.id,
              programName: program.name,
              status: result.code === "MANUAL_PRICE_REQUIRED" ? "manual_required" as const : "unavailable" as const,
              customerRetail: null,
              dealerCost: null,
              matchedWidth: null,
              matchedHeight: null,
              errorCode: result.code,
              message: result.error,
            };
          }
          return {
            productId: product.id,
            programId: program.id,
            programName: program.name,
            status: "priced" as const,
            customerRetail: null,
            dealerCost: {
              unit: result.dealerNetUnitCost,
              total: money(result.dealerNetUnitCost * quantity),
            },
            matchedWidth: result.matchedWidth,
            matchedHeight: result.matchedHeight,
            errorCode: null,
            message: "Customer retail is undefined for this dealer-net source.",
          };
        }

        const result = priceDesign(priceInput);
        if (!result.ok) {
          return {
            productId: product.id,
            programId: program.id,
            programName: program.name,
            status: result.code === "MANUAL_PRICE_REQUIRED" ? "manual_required" as const : "unavailable" as const,
            customerRetail: null,
            dealerCost: null,
            matchedWidth: null,
            matchedHeight: null,
            errorCode: result.code,
            message: result.error,
          };
        }
        return {
          productId: product.id,
          programId: program.id,
          programName: program.name,
          status: "priced" as const,
          customerRetail: { unit: result.unitPrice, total: result.total },
          dealerCost: result.wholesaleUnitPrice == null || result.wholesaleTotal == null
            ? null
            : { unit: result.wholesaleUnitPrice, total: result.wholesaleTotal },
          matchedWidth: result.matchedWidth,
          matchedHeight: result.matchedHeight,
          errorCode: null,
          message: null,
        };
      }),
    }));

  return { productType: input.productType, widthInches, heightInches, quantity, products };
}
