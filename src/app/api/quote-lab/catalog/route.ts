import { NextRequest, NextResponse } from "next/server";
import {
  isQuoteLabAuthorized,
  QuoteLabConfigurationError,
  quoteLabUnauthorizedResponse,
} from "@/lib/quote-lab/auth";
import { QUOTE_LAB_ISOLATION } from "@/lib/quote-lab/comparison";
import { quoteLabFixtures } from "@/lib/quote-lab/fixtures";
import type { QuoteLabCatalogResponse } from "@/lib/quote-lab/types";
import { buildUiCatalog, resolveMotorizationOptionsForProduct } from "@/lib/quote/ui-catalog";
import { quoteLabProductType } from "@/lib/quote-lab/builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!isQuoteLabAuthorized(request)) return quoteLabUnauthorizedResponse();
    const catalog = buildUiCatalog();
    const groupsById = new Map(catalog.motorization.map((group) => [group.groupId, group]));
    const response: QuoteLabCatalogResponse = {
      source: catalog.source,
      effectiveDate: catalog.effectiveDate,
      products: catalog.products.map((product) => ({
        id: product.id,
        name: product.name,
        productType: quoteLabProductType(product.id) ?? product.productType,
        manufacturer: product.manufacturer,
        system: product.system,
        priceBasis: product.priceBasis,
        provisional: product.provisional,
        source: product.source,
        programs: product.programs.map((program) => ({
          id: program.id,
          name: program.name,
          priceAxis: program.priceAxis,
          priceBasis: program.priceBasis,
        })),
        fabrics: product.fabrics,
        surcharges: product.surcharges,
        motorizationGroups: product.motorizationGroups
          .map((groupId) => groupsById.get(groupId))
          .filter((group): group is NonNullable<typeof group> => Boolean(group))
          .map((group) => ({
            groupId: group.groupId,
            name: group.name,
            options: resolveMotorizationOptionsForProduct(group, product.id),
          })),
      })),
      fixtures: quoteLabFixtures,
      isolation: QUOTE_LAB_ISOLATION,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof QuoteLabConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Quote Lab catalog could not be loaded." }, { status: 500 });
  }
}
