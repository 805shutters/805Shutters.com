# Manufacturer Price Comparison

The protected Quote Lab shows a `Compare manufacturers` rail when two or more manufacturers serve the selected product category. The comparison uses the line item's measured width, height, and quantity.

## Price Basis

- Suggested-retail catalogs show customer retail and dealer cost when both are defined.
- Dealer-net catalogs show dealer cost only and label customer retail as undefined.
- Manual, unavailable, out-of-range, and blank source cells remain explicitly blocked.
- Base prices exclude accessories, motorization, discounts, freight, and other product-specific additions because those options are not interchangeable across manufacturers.
- The comparison endpoint returns calculated amounts only. It does not project source cost grids, margin, or full stock-cost records to the browser.

## Switching

No product is selected automatically from the comparison. The user must expand a manufacturer, choose a specific program, and click its switch icon. An explicit switch clears product-specific accessories, fabric, motor, and remote selections so options from the previous manufacturer cannot carry into the replacement product.

## Future Manufacturers

A catalog product appears automatically when its catalog id is mapped to an existing Quote Lab product category in `src/lib/quote-lab/builder.ts`. A new top-level category still requires the normal taxonomy addition. Every new source must declare its price basis so retail and dealer cost remain separate.
