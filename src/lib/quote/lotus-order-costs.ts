const PIECE_EXCEPTION_PREFIXES = [
  "lotus_rtx_2in_vinyl_plus_",
  "lotus_flx_2in_",
  "lotus_flxe_2in_",
  "lotus_ftx_2in_",
  "lotus_ftxlg_2in_",
  "lotus_fcx_2in_",
  "lotus_fpx_2in_",
  "lotus_fgx_2_5in_",
];

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function lotusAllowsPieceOrdering(programId: string): boolean {
  return PIECE_EXCEPTION_PREFIXES.some((prefix) => programId.startsWith(prefix));
}

export function lotusBrokenPackageSurcharge(input: {
  programId: string;
  dealerNetUnitCost: number;
  quantity: number;
  cartonQty: number;
}): number {
  if (lotusAllowsPieceOrdering(input.programId)) return 0;
  const quantity = Math.max(1, Math.floor(input.quantity));
  const cartonQty = Math.max(1, Math.floor(input.cartonQty));
  if (quantity % cartonQty === 0) return 0;
  return money(input.dealerNetUnitCost * quantity * 0.25);
}

export function lotusSmallOrderSurcharge(dealerNetMerchandiseSubtotal: number): number {
  return dealerNetMerchandiseSubtotal < 50 ? 5 : 0;
}

/** `null` means the source does not define the freight amount. */
export function lotusFreightCost(dealerNetMerchandiseSubtotal: number): number | null {
  return dealerNetMerchandiseSubtotal > 2500 ? 0 : null;
}
