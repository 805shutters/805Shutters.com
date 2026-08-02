import registryJson from "./manufacturer-order-form-registry.json";

export type OrderEntryCapabilityState = "portal_draft_verified" | "portal_draft_conditional" | "document_packet_verified" | "portal_auth_required" | "portal_schema_required" | "portal_mapping_required";
export type OrderEntryRouteCapability = {
  manufacturer: "Norman" | "Onyx" | "Lotus" | "Polar";
  routingKey: string;
  productName: string;
  state: OrderEntryCapabilityState;
  enterOrderMode: "portal_draft" | "document_packet" | "blocked";
  exactBoundary: string;
  evidence: string;
};

type RegistryEntry = { routing_key: string; product_name: string; portal_material?: string | null };
const manufacturers = registryJson.manufacturers as Record<string, RegistryEntry[]>;

function routeCapability(manufacturerKey: string, entry: RegistryEntry): OrderEntryRouteCapability {
  if (manufacturerKey === "norman") {
    const roller = entry.routing_key === "norman:roller";
    return { manufacturer: "Norman", routingKey: entry.routing_key, productName: entry.product_name,
      state: roller ? "portal_draft_verified" : "portal_schema_required", enterOrderMode: roller ? "portal_draft" : "blocked",
      exactBoundary: roller ? "Saved Norman cart/draft review; never checkout or place order." : "Product packet only; do not enter a portal without exact product selectors.",
      evidence: roller ? "Authenticated Norman dealer adapter and exact Soluna Roller recipe." : "Authenticated Norman Place Order route exists, but this product-specific field recipe is not verified." };
  }
  if (manufacturerKey === "onyx") {
    const mapped = Boolean(entry.portal_material);
    return { manufacturer: "Onyx", routingKey: entry.routing_key, productName: entry.product_name,
      state: mapped ? "portal_draft_conditional" : "portal_mapping_required", enterOrderMode: mapped ? "portal_draft" : "blocked",
      exactBoundary: mapped ? "Onyx review draft only; dynamic compatibility fields must remain exact." : "Do not enter the portal until the exact Onyx material value is mapped.",
      evidence: mapped ? `Authenticated Onyx material route ${entry.portal_material}; dependent options are revalidated per line.` : "No exact Onyx portal material value is recorded for this catalog product." };
  }
  if (manufacturerKey === "lotus") {
    const storefrontUnavailable = entry.routing_key === "lotus:lotus_roller_shades" || entry.routing_key === "lotus:lotus_vertical_blinds";
    return { manufacturer: "Lotus", routingKey: entry.routing_key, productName: entry.product_name,
      state: "document_packet_verified", enterOrderMode: "document_packet",
      exactBoundary: "Generated product-specific order packet; never email, cart, checkout, or submit automatically.",
      evidence: storefrontUnavailable
        ? "Official Lotus custom collection currently exposes zero products; use the exact order-document workflow."
        : "Official Lotus storefront exposes stock-size commerce, not a verified arbitrary-measure custom-order form; use the exact order-document workflow." };
  }
  return { manufacturer: "Polar", routingKey: entry.routing_key, productName: entry.product_name,
    state: "portal_auth_required", enterOrderMode: "blocked",
    exactBoundary: "Stop at Polar PIC identity boundary until an existing authenticated session exposes exact selectors.",
    evidence: "Polar PIC currently requires the account password; no credential or MFA entry is authorized." };
}

export const MANUFACTURER_ORDER_CAPABILITY_MATRIX: readonly OrderEntryRouteCapability[] = Object.entries(manufacturers).flatMap(([key, entries]) => entries.map((entry) => routeCapability(key, entry)));
export function orderEntryRouteCapability(routingKey: string): OrderEntryRouteCapability | null {
  const exact = routingKey.trim().toLowerCase();
  return MANUFACTURER_ORDER_CAPABILITY_MATRIX.find((entry) => entry.routingKey === exact) || null;
}
