import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Exercise the actual CRM navigation handler with controlled network timing,
// without mounting unrelated CRM dashboards or contacting production.
const source = ts.createSourceFile("CrmApp.tsx", readFileSync("src/components/crm/CrmApp.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.FunctionDeclaration | undefined;
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "openQuoteWorkspaceQuote") handler = node;
  ts.forEachChild(node, visit);
}
visit(source);
if (!handler) throw new Error("CRM quote navigation handler was not found");
const compiled = ts.transpileModule(handler.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function deferred() {
  let resolve!: (result: unknown) => void; let reject!: (reason: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const requests = new Map<string, ReturnType<typeof deferred>>();
  const fetch = vi.fn((_session: unknown, path: string, init?: RequestInit) => {
    if (init?.method === "POST") return Promise.resolve({ route: ready("obsolete-import") });
    const request = deferred(); requests.set(path, request); return request.promise;
  });
  const setBusy = vi.fn(); const setMessage = vi.fn(); const openContract = vi.fn();
  let selected: { quoteId: string; requestId: number } | null = null;
  const open = new Function("crmFetch", "session", "quoteOpenRequestVersion", "setBusy", "setMessage", "setBuilderQuoteId", "setActiveTab", "setQuoteWorkspaceOpenRequest", "openQuoteContract", `${compiled}; return openQuoteWorkspaceQuote;`)(
    fetch, {}, { current: 0 }, setBusy, setMessage, vi.fn(), vi.fn(),
    (update: (value: typeof selected) => typeof selected) => { selected = update(selected); }, openContract,
  ) as (id: string, tab?: "builder" | "contract") => Promise<void>;
  return { open, requests, fetch, setBusy, setMessage, openContract, selected: () => selected };
}
const ready = (id: string) => ({ status: "ready", salesQuoteId: id, historicalPriceLock: null });
const path = (id: string) => `/api/crm/quotes/${id}/v2-route`;

describe("saved quote navigation with delayed responses", () => {
  it("keeps the last requested alternative when an older route returns afterward", async () => {
    const app = setup(); const old = app.open("D"); const latest = app.open("C");
    app.requests.get(path("C"))!.resolve(ready("sales-C")); await latest;
    app.requests.get(path("D"))!.resolve(ready("sales-D")); await old;
    expect(app.selected()?.quoteId).toBe("sales-C");
  });
  it("does not import an obsolete quote or clear the current loading state", async () => {
    const app = setup(); const old = app.open("D"); const latest = app.open("C");
    app.requests.get(path("D"))!.resolve({ status: "legacy_import_required" }); await old;
    expect(app.fetch).toHaveBeenCalledTimes(2);
    expect(app.setBusy).not.toHaveBeenCalledWith(false);
    app.requests.get(path("C"))!.resolve(ready("sales-C")); await latest;
    expect(app.selected()?.quoteId).toBe("sales-C");
  });
  it("ignores an older request's error while the current quote opens", async () => {
    const app = setup(); const old = app.open("D"); const latest = app.open("C");
    app.requests.get(path("D"))!.reject(new Error("Old failure")); await old;
    expect(app.setMessage).not.toHaveBeenCalledWith("Old failure");
    expect(app.setBusy).not.toHaveBeenCalledWith(false);
    app.requests.get(path("C"))!.resolve(ready("sales-C")); await latest;
    expect(app.selected()?.quoteId).toBe("sales-C");
  });
  it("does not reopen an earlier builder after the user chooses a contract", async () => {
    const app = setup(); const old = app.open("D"); await app.open("C", "contract");
    app.requests.get(path("D"))!.resolve(ready("sales-D")); await old;
    expect(app.openContract).toHaveBeenCalledWith("C"); expect(app.selected()).toBeNull();
  });
});
