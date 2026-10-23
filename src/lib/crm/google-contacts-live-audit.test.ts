import { it, expect } from "vitest";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { contactsDryRun } from "./google-contacts-sync";
// Explicit opt-in only. Reads the 805 customer population; never writes to CRM/Google.
it.skipIf(process.env.CONTACTS_LIVE_READ_ONLY !== "1")("counts the complete live 805 population without exporting customer identities", async () => {
  const client = getSupabaseServiceClient();
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://evuxqsaucmvgyuvjpqlo.supabase.co");
  expect(client).not.toBeNull();
  const { counts } = await contactsDryRun(client!, { crmOnly:true });
  expect(counts.total).toBeGreaterThan(0);
  expect(counts.eligible + counts.missingData + counts.ambiguous).toBe(counts.total);
  console.info("805 Contacts CRM-only dry run:", JSON.stringify(counts));
},60000);
