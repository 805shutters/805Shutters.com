import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  root,
  "src/lib/quote-v2/fixtures/portal-parity/before-cases.json",
);
const reportPath = path.join(
  root,
  "docs/quote-v2/portal-parity/before-audit-2026-07-22.md",
);

function money(cents) {
  return cents == null
    ? "MSRP unverified"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(cents / 100);
}

function percent(basisPoints) {
  return basisPoints == null ? "—" : `${(basisPoints / 100).toFixed(2)}%`;
}

function escaped(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function categorized(components, category) {
  return components
    .filter((component) => component.category === category)
    .reduce((total, component) => total + component.amountCents, 0);
}

function ledgerDetails(ledger) {
  const lines = ledger.components.map(
    (component) =>
      `  - ${component.label}: ${money(component.amountCents)} (${component.category})`,
  );
  return [
    `- ${ledger.id} [${ledger.audience}; ${ledger.verification}]`,
    ...lines,
    `  - Subtotal: ${money(ledger.subtotalCents)}`,
    `  - Freight: ${money(ledger.freightCents)}`,
    `  - Processing: ${money(ledger.processingCents)}`,
    `  - Tax: ${money(ledger.taxCents)}`,
    `  - Grand total: ${money(ledger.grandTotalCents)}`,
  ];
}

export function renderPortalParityBeforeReport(audit) {
  const lines = [
    "# 805 Quote V2 manufacturer pricing parity — BEFORE correction",
    "",
    `Generated from \`${audit.captureId}\`. This report preserves the untouched output from Git revision \`${audit.engine.revision}\`; it contains no AFTER values and documents no pricing correction.`,
    "",
    `Route: \`${audit.engine.route}\`  `,
    `Interface marker: \`${audit.engine.interfaceMarker}\`  `,
    `Backend adapter: \`${audit.engine.adapter}\`  `,
    `Injected catalog date: \`${audit.engine.catalogAsOf}\`  `,
    `Capture time: \`${audit.capturedAt}\``,
    "",
    "No customer quote was sent, no manufacturer order was submitted, and no production data was written.",
    "",
    "## Side-by-side BEFORE results",
    "",
    "| Manufacturer | Product | Configuration | Manufacturer base | Manufacturer options | Manufacturer MSRP | 805 base | 805 options | 805 BEFORE total | Difference | Difference % | Result | Verification |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|",
  ];

  for (const auditCase of audit.cases) {
    const comparable = auditCase.manufacturerOutput.ledgers.find(
      (ledger) => ledger.id === auditCase.manufacturerOutput.comparableLedgerId,
    );
    const manufacturerBase = comparable
      ? categorized(comparable.components, "base_grid")
      : null;
    const manufacturerOptions = comparable
      ? comparable.subtotalCents - manufacturerBase
      : null;
    const systemBase = categorized(auditCase.systemBefore.components, "base_grid");
    const systemOptions =
      auditCase.systemBefore.customerRetailSubtotalCents - systemBase;
    const configuration = auditCase.lines
      .map(
        (line) =>
          `${line.widthInches} x ${line.heightInches} x ${line.quantity}: ${line.configuration}`,
      )
      .join("; ");
    lines.push(
      `| ${escaped(auditCase.manufacturer)} | ${escaped(auditCase.product.name)} | ${escaped(configuration)} | ${money(manufacturerBase)} | ${money(manufacturerOptions)} | ${money(auditCase.comparison.manufacturerCents)} | ${money(systemBase)} | ${money(systemOptions)} | ${money(auditCase.systemBefore.displayedTotalCents)} | ${auditCase.comparison.differenceCents == null ? "—" : money(auditCase.comparison.differenceCents)} | ${percent(auditCase.comparison.percentageBasisPoints)} | ${auditCase.comparison.result.toUpperCase()} | ${escaped(auditCase.classification)} |`,
    );
  }

  lines.push(
    "",
    `Failure threshold: more than ${money(audit.threshold.absoluteCents)} or ${(audit.threshold.relativeBasisPoints / 100).toFixed(2)}%. MSRP-unverified cases are never labeled pass.`,
    "",
    "## Detailed BEFORE evidence",
  );

  for (const auditCase of audit.cases) {
    lines.push(
      "",
      `### ${auditCase.manufacturer} — ${auditCase.product.name}`,
      "",
      `Test: \`${auditCase.id}\`  `,
      `Classification: \`${auditCase.classification}\`  `,
      `Product/program: \`${auditCase.product.id}\` / \`${auditCase.product.programId}\`  `,
      `Source: \`${auditCase.source.sourceId}\`${auditCase.source.pages.length ? `, page(s) ${auditCase.source.pages.join(", ")}` : ""}`,
      "",
      "Selections:",
      ...auditCase.lines.map(
        (line, index) =>
          `- Line ${index + 1}: ${line.widthInches} x ${line.heightInches}; quantity ${line.quantity}; ${line.configuration}`,
      ),
      "",
      "MANUFACTURER SYSTEM OUTPUT",
      ...auditCase.manufacturerOutput.ledgers.flatMap(ledgerDetails),
      "",
      "805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION",
      `- Status: ${auditCase.systemBefore.status}`,
      `- Product/validation status: ${auditCase.systemBefore.productStatus} / ${auditCase.systemBefore.validationStatus}`,
      `- Sendable: ${auditCase.systemBefore.sendable ? "yes" : "no"}`,
      ...auditCase.systemBefore.components.map(
        (component) =>
          `- ${component.label}: ${money(component.amountCents)} (${component.category})`,
      ),
      `- Customer retail subtotal: ${money(auditCase.systemBefore.customerRetailSubtotalCents)}`,
      `- Displayed total: ${money(auditCase.systemBefore.displayedTotalCents)}`,
      `- Internal product cost: ${money(auditCase.systemBefore.internalCost.productCents)}`,
      `- Internal freight: ${money(auditCase.systemBefore.internalCost.freightCents)}`,
      `- Internal oversize: ${money(auditCase.systemBefore.internalCost.oversizeCents)}`,
      `- Internal processing: ${money(auditCase.systemBefore.internalCost.processingCents)}`,
      `- Internal landed cost: ${money(auditCase.systemBefore.internalCost.landedCents)}`,
      ...(auditCase.systemBefore.error
        ? [`- Block/error: ${auditCase.systemBefore.error}`]
        : []),
      ...(auditCase.systemBefore.nonAuthoritativeDiagnostic
        ? [
            `- Non-authoritative diagnostic only: source/list ${money(auditCase.systemBefore.nonAuthoritativeDiagnostic.sourceListCents)}, dealer ${money(auditCase.systemBefore.nonAuthoritativeDiagnostic.dealerCents)}, projected customer ${money(auditCase.systemBefore.nonAuthoritativeDiagnostic.projectedCustomerCents)}. ${auditCase.systemBefore.nonAuthoritativeDiagnostic.note}`,
          ]
        : []),
      "",
      "DIFFERENCE",
      `- MANUFACTURER SAID: ${money(auditCase.comparison.manufacturerCents)}`,
      `- 805 SAID BEFORE CORRECTION: ${money(auditCase.comparison.systemCents)}`,
      `- Difference: ${auditCase.comparison.differenceCents == null ? "not comparable" : `${money(auditCase.comparison.differenceCents)} / ${percent(auditCase.comparison.percentageBasisPoints)}`}`,
      `- Result: ${auditCase.comparison.result.toUpperCase()}`,
      `- Exact discrepancy start: ${auditCase.comparison.firstDiscrepancy}`,
      `- Suspected cause: ${auditCase.comparison.suspectedCause}`,
      ...(auditCase.limitations.length
        ? ["- Limitations:", ...auditCase.limitations.map((item) => `  - ${item}`)]
        : []),
    );
  }

  lines.push(
    "",
    "## Coverage limitations",
    "",
    ...audit.coverage.map(
      (entry) =>
        `- ${entry.manufacturer}: ${entry.caseCount} case(s), ${entry.distinctProductCount} distinct product(s), status \`${entry.status}\`${entry.limitation ? `. ${entry.limitation}` : "."}`,
    ),
    "",
    "## Evidence boundary",
    "",
    "The tracked fixture and evidence receipt contain no credentials, customer PII, dealer-account number, portal session data, or full authenticated portal URL. The private Polar image is represented by its SHA-256 and a non-PII fact receipt. It is attached only to the exact Elite case and is not reused as evidence for unrelated Polar products.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const audit = JSON.parse(await readFile(fixturePath, "utf8"));
  const rendered = renderPortalParityBeforeReport(audit);
  if (process.argv.includes("--check")) {
    const current = await readFile(reportPath, "utf8").catch(() => "");
    if (current !== rendered) {
      throw new Error(`Generated report is stale: ${path.relative(root, reportPath)}`);
    }
    return;
  }
  await writeFile(reportPath, rendered, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
