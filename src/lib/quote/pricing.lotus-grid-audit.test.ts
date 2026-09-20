import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { priceDealerNetDesign, priceDesign } from "./pricing";
import { isLotusObservedProduct } from "./lotus-observed-offerings";

// Exhaustive routing evidence; this does not certify current supplier authority.
describe("Lotus complete source-grid routing audit", () => {
  it("routes every source cell and its lower boundary to the same retail/dealer grids", () => {
    let cells = 0, unavailable = 0;
    for (const product of catalog.products.filter(p=>p.manufacturer === "Lotus" && !isLotusObservedProduct(p.id))) {
      for (const program of product.programs) {
        const grid=program.grid;
        for(let y=0;y<grid.prices.length;y++) for(let x=0;x<grid.prices[y].length;x++) {
          const width=grid.widths[x] ?? 1;
          const height=grid.heights[y] ?? 1;
          const retail=grid.prices[y][x];
          cells++;
          if(retail===null) unavailable++;
          for(const delta of [0,1/16]) {
            const input={productId:product.id,programId:program.id,widthInches:width-delta,heightInches:height-delta};
            const sell=priceDesign(input), cost=priceDealerNetDesign(input);
            const label=`${program.id} ${width}x${height} minus ${delta}`;
            if(retail===null) {
              expect(sell,label).toMatchObject({ok:false,code:"NA_CELL"});
              expect(cost,label).toMatchObject({ok:false,code:"NA_CELL"});
            } else {
              expect(sell,label).toMatchObject({ok:true,base:retail});
              expect(cost,label).toMatchObject({ok:true,dealerNetBaseCost:grid.costs?.[y]?.[x]});
            }
          }
        }
      }
    }
    expect(cells).toBe(1580);
    expect(unavailable).toBe(86);
  });
});
