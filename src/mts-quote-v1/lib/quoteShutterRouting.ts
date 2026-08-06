export const WOOD_SHUTTER_ROUTES = ["Premium Wood", "Standard Wood"] as const;

export type WoodShutterRoute = (typeof WOOD_SHUTTER_ROUTES)[number];

export interface ShutterRoutePatch {
  supplier: "Norman" | "Onyx";
  material: string | null;
  productId: "norman_shutters" | "onyx_shutters";
  programId: string | null;
  options: Record<string, string | null>;
}

export function getAutoShutterRoutePatch(
  variant: string | null | undefined
): ShutterRoutePatch | null {
  if (variant === "B") {
    return {
      supplier: "Norman",
      material: null,
      productId: "norman_shutters",
      programId: "woodlore",
      options: {
        material_type: "Composite",
        composite_subtype: "Woodlore",
      },
    };
  }

  if (variant === "C") {
    return {
      supplier: "Onyx",
      material: "Poly Composite",
      productId: "onyx_shutters",
      programId: "poly_composite",
      options: {
        material_type: "Poly",
        composite_subtype: null,
      },
    };
  }

  return null;
}

export function getWoodShutterRoutePatch(route: WoodShutterRoute): ShutterRoutePatch {
  if (route === "Premium Wood") {
    return {
      supplier: "Norman",
      material: null,
      productId: "norman_shutters",
      programId: null,
      options: {
        wood_route: route,
        material_type: "Wood",
        composite_subtype: null,
      },
    };
  }

  return {
    supplier: "Onyx",
    material: null,
    productId: "onyx_shutters",
    programId: null,
    options: {
      wood_route: route,
      material_type: "Wood",
      composite_subtype: null,
    },
  };
}
