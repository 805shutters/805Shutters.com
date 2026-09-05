import { it, expect, vi } from "vitest";
import { submitInstallerForm } from "./installer-forms";
import { sendEmail } from "@/lib/notify/email";
vi.mock("@/lib/notify/email", () => ({ sendEmail: vi.fn() }));
function fixture(revision = 0) {
  const saved: Record<string, unknown>[] = [];
  const form = {
    id: "form",
    quote_id: "quote",
    job_id: "job",
    status: "sent",
    issues: [],
    line_snapshot: [],
    cod_original: 0,
    customer_snapshot: {
      name: "Synthetic Installer Test",
      quoteNumber: "TEST",
    },
    meta: { workflow: { revision, outcome: "completed" } },
  };
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: form }) }),
      }),
      update: (data: Record<string, unknown>) => {
        saved.push(data);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  return { supabase, saved };
}
it("returns server save acknowledgement independently of failed office notification", async () => {
  vi.mocked(sendEmail).mockRejectedValueOnce(
    new Error("Synthetic provider unavailable"),
  );
  const { supabase, saved } = fixture();
  const result = await submitInstallerForm(supabase as never, "synthetic", {
    accepted: true,
    signerName: "Fixture",
    outcome: "completed",
    expectedRevision: 0,
  });
  expect(saved).toHaveLength(1);
  expect(result).toMatchObject({
    revision: 1,
    status: "completed",
    reportEmail: { sent: false },
  });
  expect(result.savedAt).toBeTruthy();
});
it("rejects a stale field revision before writing or notifying", async () => {
  vi.mocked(sendEmail).mockClear();
  const { supabase, saved } = fixture(2);
  await expect(
    submitInstallerForm(supabase as never, "synthetic", {
      accepted: true,
      signerName: "Fixture",
      outcome: "completed",
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(saved).toHaveLength(0);
  expect(sendEmail).not.toHaveBeenCalled();
});
