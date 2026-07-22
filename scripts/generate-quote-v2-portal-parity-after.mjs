import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const beforePath = path.join(
  root,
  "src/lib/quote-v2/fixtures/portal-parity/before-cases.json",
);
const afterPath = path.join(
  root,
  "src/lib/quote-v2/fixtures/portal-parity/after-cases.json",
);
const reportPath = path.join(
  root,
  "docs/quote-v2/portal-parity/after-audit-2026-07-22.md",
);

function money(cents) {
  if (cents === null || cents === undefined) return "MSRP unverified";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function signedMoney(cents) {
  if (cents === null || cents === undefined) return "not comparable";
  const absolute = money(Math.abs(cents));
  return cents > 0 ? `+${absolute}` : cents < 0 ? `-${absolute}` : money(0);
}

function percent(basisPoints) {
  if (basisPoints === null || basisPoints === undefined) return "—";
  return `${(basisPoints / 100).toFixed(2)}%`;
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
  return [
    `- ${ledger.id} [${ledger.audience}; ${ledger.verification}]`,
    ...ledger.components.map(
      (component) =>
        `  - ${component.label}: ${money(component.amountCents)} (${component.category})`,
    ),
    `  - Merchandise/customer subtotal: ${money(ledger.subtotalCents)}`,
    `  - Freight: ${money(ledger.freightCents)}`,
    `  - Processing: ${money(ledger.processingCents)}`,
    `  - Tax: ${money(ledger.taxCents)}`,
    `  - Grand total: ${money(ledger.grandTotalCents)}`,
  ];
}

function systemDetails(label, output) {
  return [
    label,
    `- Status: ${output.status}`,
    `- Product/validation status: ${output.productStatus} / ${output.validationStatus}`,
    `- Sendable: ${output.sendable ? "yes" : "no"}`,
    ...(output.components.length
      ? output.components.map(
          (component) =>
            `- ${component.label}: ${money(component.amountCents)} (${component.category})`,
        )
      : ["- Customer price components: none (fail-closed)"]),
    `- Customer retail subtotal: ${money(output.customerRetailSubtotalCents)}`,
    `- Grand/displayed total: ${money(output.displayedTotalCents)}`,
    `- Internal product cost: ${money(output.internalCost.productCents)}`,
    `- Internal freight: ${money(output.internalCost.freightCents)}`,
    `- Internal oversize: ${money(output.internalCost.oversizeCents)}`,
    `- Internal processing: ${money(output.internalCost.processingCents)}`,
    `- Internal landed cost: ${money(output.internalCost.landedCents)}`,
    ...(output.blockCodes.length
      ? [`- Block codes: ${output.blockCodes.map((code) => `\`${code}\``).join(", ")}`]
      : []),
    ...(output.error ? [`- Block/error: ${output.error}`] : []),
  ];
}

export function renderPortalParityAfterReport(before, after) {
  const beforeById = new Map(before.cases.map((entry) => [entry.id, entry]));
  const lines = [
    "# INTERNAL — 805 Quote V2 manufacturer pricing parity — AFTER correction",
    "",
    `Correction revision: \`${after.correctionRevision}\`<br>`,
    `Immutable BEFORE capture: \`${after.beforeCaptureId}\` at revision \`${before.engine.revision}\`<br>`,
    `Configured application route: \`${after.engine.route}\` / \`${after.engine.interfaceMarker}\` / \`${after.engine.backend}\``,
    "",
    "The AFTER JSON is a source-controlled price-reconciliation expectation, not a manufacturer-portal capture. The permanent parity test independently replays source pricing through the authoritative runtime APIs and replays sendability through the existing-interface adapter. A hard-blocked exact configuration can therefore have a verified source-price reconciliation below while the adapter correctly exposes no customer total.",
    "",
    "No manufacturer order was placed, no customer quote was sent, and no production data was changed. Portal evidence is used only for the exact configuration it proves; official-book and unverified cases remain labeled separately.",
    "",
    "## Before-versus-after summary",
    "",
    "| Manufacturer | Product | Manufacturer MSRP/list | 805 BEFORE | BEFORE difference | 805 AFTER | Remaining difference | Remaining % | Final result | Evidence |",
    "|---|---|---:|---:|---:|---:|---:|---:|---|---|",
  ];

  for (const afterCase of after.cases) {
    const beforeCase = beforeById.get(afterCase.id);
    if (!beforeCase) throw new Error(`Unknown BEFORE case ${afterCase.id}`);
    lines.push(
      `| ${escaped(beforeCase.manufacturer)} | ${escaped(beforeCase.product.name)} | ${money(beforeCase.comparison.manufacturerCents)} | ${money(beforeCase.systemBefore.displayedTotalCents)} | ${signedMoney(beforeCase.comparison.differenceCents)} | ${money(afterCase.systemAfter.displayedTotalCents)} | ${signedMoney(afterCase.comparisonAfter.differenceCents)} | ${percent(afterCase.comparisonAfter.percentageBasisPoints)} | ${afterCase.comparisonAfter.result.toUpperCase()} | ${escaped(beforeCase.classification)} |`,
    );
  }

  lines.push(
    "",
    `Pass threshold: no more than ${money(before.threshold.absoluteCents)} and ${(before.threshold.relativeBasisPoints / 100).toFixed(2)}%. A case with no manufacturer MSRP remains UNVERIFIED, never PASS.`,
    "",
    "## Detailed exact-case reconciliation",
  );

  for (const afterCase of after.cases) {
    const beforeCase = beforeById.get(afterCase.id);
    lines.push(
      "",
      `### ${beforeCase.manufacturer} — ${beforeCase.product.name}`,
      "",
      `Test: \`${beforeCase.id}\`<br>`,
      `Product/program: \`${beforeCase.product.id}\` / \`${beforeCase.product.programId}\`<br>`,
      `Classification: \`${beforeCase.classification}\`<br>`,
      `Source: \`${beforeCase.source.sourceId}\`${beforeCase.source.pages.length ? `, page(s) ${beforeCase.source.pages.join(", ")}` : ""}`,
      "",
      "Selections:",
      ...beforeCase.lines.map(
        (line, index) =>
          `- Line ${index + 1}: ${line.widthInches} x ${line.heightInches}; quantity ${line.quantity}; ${line.configuration}`,
      ),
      "",
      "MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT",
      ...beforeCase.manufacturerOutput.ledgers.flatMap(ledgerDetails),
      "",
      ...systemDetails("805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION", beforeCase.systemBefore),
      "",
      ...systemDetails("805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION", afterCase.systemAfter),
      "",
      "BEFORE / AFTER RESULT",
      `- MANUFACTURER SAID: ${money(beforeCase.comparison.manufacturerCents)}`,
      `- 805 SAID BEFORE CORRECTION: ${money(beforeCase.systemBefore.displayedTotalCents)}`,
      `- 805 SAID AFTER CORRECTION: ${money(afterCase.systemAfter.displayedTotalCents)}`,
      `- BEFORE difference: ${signedMoney(beforeCase.comparison.differenceCents)} / ${percent(beforeCase.comparison.percentageBasisPoints)}`,
      `- Remaining difference: ${signedMoney(afterCase.comparisonAfter.differenceCents)} / ${percent(afterCase.comparisonAfter.percentageBasisPoints)}`,
      `- RESULT: ${afterCase.comparisonAfter.result.toUpperCase()}`,
      `- Exact discrepancy/root cause: ${afterCase.resolution.rootCause}`,
      `- Correction: ${afterCase.resolution.change}`,
      `- Remaining limitation: ${afterCase.resolution.remainingLimitation ?? "none for this exact pricing comparison"}`,
    );
  }

  lines.push(
    "",
    "## Source-vault verification",
    "",
    `Status: ${after.sourceVerification.status.toUpperCase()}; ${after.sourceVerification.verifiedArtifactCount} pinned artifacts verified.`,
    "",
    ...after.sourceVerification.unresolved.map(
      (entry) =>
        `- \`${entry.sourceId}\` / \`${entry.fileName}\`: ${entry.reason}${entry.reason === "hash_mismatch" ? `; expected ${entry.expectedByteLength} bytes / \`${entry.expectedSha256}\`, found ${entry.foundByteLength} bytes / \`${entry.foundSha256}\`` : ""}.`,
    ),
    "",
    "These gaps remain explicit blockers for the affected source paths; they were not treated as successful parity evidence.",
    "",
    "## Corrections and unresolved boundaries",
    "",
    ...after.corrections.map((entry) => `- **${entry.title}:** ${entry.detail}`),
    "",
    "## Evidence inventory",
    "",
    ...after.evidence.map(
      (entry) =>
        `- \`${entry.id}\` — ${entry.classification}; ${entry.note}${entry.sha256 ? ` Private-artifact SHA-256 \`${entry.sha256}\`` : ""}${entry.byteLength ? `; ${entry.byteLength} bytes` : ""}${entry.path ? `; redacted receipt \`${entry.path}\`` : ""}${entry.exactCaseIds?.length ? `; exact case(s): ${entry.exactCaseIds.map((id) => `\`${id}\``).join(", ")}` : "; no exact-case reuse"}.`,
    ),
    "",
    "## 805 visible-interface evidence",
    "",
    ...after.systemEvidence.flatMap((entry) => [
      `- \`${entry.id}\` — ${entry.classification}; route \`${entry.route}\`; redacted receipt \`${entry.path}\`; exact case(s): ${entry.exactCaseIds.map((id) => `\`${id}\``).join(", ")}. ${entry.note}`,
      ...entry.captures.map(
        (capture) =>
          `  - \`${capture.id}\`: SHA-256 \`${capture.sha256}\`; ${capture.byteLength} bytes.`,
      ),
    ]),
    "",
    "The private evidence files are not copied into source control. Receipts contain no credentials, session tokens, customer PII, or full authenticated portal URLs. The visible 805 captures contain no customer PII or authenticated manufacturer-portal data.",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

async function main() {
  const [before, after] = await Promise.all([
    readFile(beforePath, "utf8").then(JSON.parse),
    readFile(afterPath, "utf8").then(JSON.parse),
  ]);
  const rendered = renderPortalParityAfterReport(before, after);
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
