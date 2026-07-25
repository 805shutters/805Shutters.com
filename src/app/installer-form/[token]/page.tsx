import { notFound } from "next/navigation";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { loadInstallerFormByToken } from "@/lib/crm/installer-forms";
import { InstallerFormClient } from "./InstallerFormClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function InstallerFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseServiceClient();
  if (!supabase) return <main style={wrap}>The installation form is temporarily unavailable.</main>;
  const form = await loadInstallerFormByToken(supabase, token);
  if (!form) notFound();
  const customer = form.customer_snapshot;
  return (
    <main style={wrap}>
      <header style={{ borderBottom: "2px solid #111", marginBottom: 20, paddingBottom: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase" }}>805 Shutters</div>
        <h1 style={{ margin: "5px 0" }}>Installation Form</h1>
        <strong>{customer.name}</strong>
        <div>{customer.address}</div>
        <div>{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</div>
        {customer.quoteNumber ? <div>Contract {customer.quoteNumber}</div> : null}
      </header>
      <InstallerFormClient form={form} />
    </main>
  );
}

const wrap = { maxWidth: 760, margin: "0 auto", padding: "32px 18px", fontFamily: "system-ui, sans-serif", color: "#111", background: "#fbfbfa" } as const;
