export type ShutterSquareFootGridDefinition = {
  manufacturer: string;
  productId: string;
  programId: string;
  minimumBillableSquareFeet: number;
  retailRatePerSquareFoot: number | null;
  wholesaleRatePerSquareFoot: number | null;
};

export type ShutterSquareFootGridRow = {
  squareFeet: number;
  retailPrice: number | null;
  wholesalePrice: number | null;
};

export type ShutterSquareFootGridSelection = {
  actualSquareFeet: number;
  row: ShutterSquareFootGridRow;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Creates one isolated square-foot pricing grid for one manufacturer + shutter
 * product. A grid has no fallback, multiplier, or association with any sibling
 * product. Rows are addressed by whole square feet and materialized when the
 * sizing chart requests them, so documented product limits can be enforced
 * independently without inventing a universal maximum.
 */
export function createShutterSquareFootGrid(
  definition: ShutterSquareFootGridDefinition,
) {
  const {
    manufacturer,
    productId,
    programId,
    minimumBillableSquareFeet,
    retailRatePerSquareFoot,
    wholesaleRatePerSquareFoot,
  } = definition;

  if (!manufacturer || !productId || !programId) {
    throw new Error("A shutter square-foot grid requires manufacturer, product, and program identity.");
  }
  if (
    !Number.isInteger(minimumBillableSquareFeet) ||
    minimumBillableSquareFeet < 1
  ) {
    throw new Error(`${manufacturer} ${programId} has an invalid minimum square-foot row.`);
  }
  if (
    retailRatePerSquareFoot != null &&
    (!Number.isFinite(retailRatePerSquareFoot) || retailRatePerSquareFoot <= 0)
  ) {
    throw new Error(`${manufacturer} ${programId} has an invalid retail square-foot rate.`);
  }
  if (
    wholesaleRatePerSquareFoot != null &&
    (!Number.isFinite(wholesaleRatePerSquareFoot) ||
      wholesaleRatePerSquareFoot <= 0)
  ) {
    throw new Error(`${manufacturer} ${programId} has an invalid wholesale square-foot rate.`);
  }

  const row = (squareFeet: number): ShutterSquareFootGridRow => {
    if (!Number.isInteger(squareFeet) || squareFeet < minimumBillableSquareFeet) {
      throw new Error(
        `${manufacturer} ${programId} requires a whole square-foot row at or above ${minimumBillableSquareFeet}.`,
      );
    }
    return {
      squareFeet,
      retailPrice:
        retailRatePerSquareFoot == null
          ? null
          : roundMoney(squareFeet * retailRatePerSquareFoot),
      wholesalePrice:
        wholesaleRatePerSquareFoot == null
          ? null
          : roundMoney(squareFeet * wholesaleRatePerSquareFoot),
    };
  };

  const select = (
    widthInches: number,
    heightInches: number,
  ): ShutterSquareFootGridSelection => {
    if (
      !Number.isFinite(widthInches) ||
      widthInches <= 0 ||
      !Number.isFinite(heightInches) ||
      heightInches <= 0
    ) {
      throw new Error(`${manufacturer} ${programId} requires positive dimensions.`);
    }
    const actualSquareFeet = (widthInches * heightInches) / 144;
    const selectedSquareFeet = Math.max(
      minimumBillableSquareFeet,
      Math.ceil(actualSquareFeet),
    );
    return {
      actualSquareFeet,
      row: row(selectedSquareFeet),
    };
  };

  return {
    definition: { ...definition },
    row,
    select,
  };
}
