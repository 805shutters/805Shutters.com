import { getProduct, getProgram } from "./catalog";

export const LOTUS_VINYL_VERSION = "lotus-vinyl-v1";
export const LOTUS_VINYL_PRODUCT = "lotus_vinyl_blinds";
const profiles = {
  lotus_mlx_1in_vinyl_custom: { code: "MLX", stockProgramId: "lotus_mlx_1in_vinyl_stock", minimumWidthCut: 0.5, pages: [8, 9, 34] },
  lotus_rlx_1in_vinyl_plus_custom: { code: "RLX", stockProgramId: "lotus_rlx_1in_vinyl_plus_stock", minimumWidthCut: 0.25, pages: [10, 11, 34] },
} as const;
export function lotusVinylProfile(programId: string | null | undefined) {
  return profiles[programId as keyof typeof profiles] ?? null;
}

/** Nominal inside-opening measurements. Physical candidates, not inventory or price approval. */
export function lotusVinylDonorSkus(programId: string, width: number, height: number, color: string): string[] {
  const profile = lotusVinylProfile(programId);
  if (!profile || !(width > 0 && height > 0) || !Number.isInteger(width * 4) || !Number.isInteger(height)) return [];
  const product = getProduct(LOTUS_VINYL_PRODUCT);
  const program = product && getProgram(product, programId);
  if (!product || !program) return [];
  const gridWidth = program.grid.widths.find(value => value >= width);
  const gridHeight = program.grid.heights.find(value => value >= height);
  if (!gridWidth || !gridHeight) return [];
  return (product.stockItems ?? []).filter(item => {
    if (item.programId !== profile.stockProgramId || item.color !== color || item.width == null || item.height == null) return false;
    const widthCut = item.width - width;
    const heightCut = item.height - height;
    return item.width <= gridWidth && item.height <= gridHeight && heightCut >= 0 && heightCut <= 10 &&
      (widthCut === 0 || (item.width > 22 && widthCut >= profile.minimumWidthCut && widthCut <= 6));
  }).map(item => item.sku);
}
