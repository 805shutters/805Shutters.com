// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuoteDashboard } from "./QuoteDashboard";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { ACCOUNT_IDS } from "@mts/lib/accounts";

const mocks = vi.hoisted(() => ({
  rows: [], pending: Promise.resolve() as Promise<unknown>,
  create: vi.fn(), read: vi.fn(), insert: vi.fn(), errors: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.rows, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries() {} }),
  useMutation: (options: { mutationFn: (input: unknown) => Promise<unknown>; onSuccess?: (result: unknown) => void; onError?: (error: unknown) => void }) => ({
    isPending: false,
    mutate(input: unknown) { mocks.pending = options.mutationFn(input).then(options.onSuccess).catch(options.onError); },
  }),
}));
vi.mock("@mts/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ single: mocks.read }) }), insert: mocks.insert }),
} }));
vi.mock("@mts/lib/quoteV2ServerClient", async (original) => ({
  ...(await original<object>()), createQuoteV2Draft: mocks.create,
}));
vi.mock("sonner", () => ({ toast: { success() {}, error: mocks.errors } }));
vi.mock("./NewQuoteDialog", () => ({ NewQuoteDialog: ({ open, onSubmit, title }: { open: boolean; onSubmit: (input: unknown) => void; title: string }) => open ? React.createElement("button", {
  onClick: () => onSubmit({ customerName: "Norman audit", customerPhone: "", customerEmail: "", customerAddress: "", accountId: ACCOUNT_IDS.SHUTTERS_805 }),
}, title + " create") : null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ quoteId: "norman-draft", quoteNumber: "805-TEST", revision: 1 });
  mocks.read.mockResolvedValue({ data: { id: "norman-draft", quote_number: "805-TEST", account_id: ACCOUNT_IDS.SHUTTERS_805, quote_v2_backend: true }, error: null });
  useQuoteBuilderStore.getState().resetBuilder();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); useQuoteBuilderStore.getState().resetBuilder(); });
async function click(name: string) {
  const button = [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === name);
  expect(button).toBeDefined();
  await act(async () => { button!.click(); await mocks.pending; });
}
it("creates the Norman draft through the server and opens that exact saved quote", async () => {
  await act(() => root.render(React.createElement(QuoteDashboard, { staffOverview: true })));
  await click("New Norman quote"); await click("New Norman quote create");
  expect(mocks.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ customerName: "Norman audit", customerPhone: null, customerEmail: null, customerAddress: null }));
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(useQuoteBuilderStore.getState().activeQuoteId).toBe("norman-draft");
  expect(useQuoteBuilderStore.getState().activeTab).toBe("builder");
});
it("retains the draft request key after an uncertain read and refuses a legacy response", async () => {
  mocks.read.mockResolvedValueOnce({ data: null, error: new Error("Read unavailable") });
  await act(() => root.render(React.createElement(QuoteDashboard, { staffOverview: true })));
  await click("New Norman quote"); await click("New Norman quote create");
  expect(useQuoteBuilderStore.getState().activeQuoteId).toBeNull();
  mocks.read.mockResolvedValueOnce({ data: { id: "norman-draft", quote_v2_backend: false }, error: null });
  await click("New Norman quote create");
  expect(mocks.create.mock.calls[1][1].idempotencyKey).toBe(mocks.create.mock.calls[0][1].idempotencyKey);
  expect(mocks.errors).toHaveBeenLastCalledWith(expect.stringContaining("did not retain its server pricing mode"));
  expect(useQuoteBuilderStore.getState().activeQuoteId).toBeNull();
});
