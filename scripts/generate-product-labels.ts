import { writeFileSync } from "node:fs";
import { listProducts } from "../src/lib/quote/catalog";

// Keep lightweight CRM labels in sync without shipping pricing grids to every tab.
const labels = Object.fromEntries(listProducts().map(product => [product.id, product.name]));
writeFileSync(new URL("../src/lib/quote/product-labels.json", import.meta.url), JSON.stringify(labels, null, 2) + "\n");
