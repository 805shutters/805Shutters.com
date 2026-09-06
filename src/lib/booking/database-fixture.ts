// Isolated test schema: real table definitions, without unrelated product migrations.
import { readFileSync } from "node:fs";
const read = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, "utf8");
function table(sql: string, name: string) {
  const pattern = new RegExp(
    `create table (?:if not exists )?public\\.${name} \\(`,
  );
  const start = sql.search(pattern);
  if (start < 0) throw new Error(`Missing fixture table ${name}`);
  return sql.slice(start, sql.indexOf("\n);", start) + 3);
}
export function bookingDatabaseFixture(beforeAuthority = "") {
  const core = read("20260603000000_create_805_crm.sql"),
    leads = read("20260602000000_create_lead_capture.sql");
  return `create role anon;create role authenticated;create role service_role bypassrls;
    create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
    create table public.sales_quotes(id uuid primary key);
    ${table(leads, "leads")}
    ${["crm_jobs", "crm_quotes", "crm_calendar_events"].map((n) => table(core, n)).join("\n")}
    ${table(read("20260624093000_port_sales_quote_builder_to_805.sql"), "sales_805_appointments")}
    ${read("20260605013000_create_crm_availability_slots.sql")}
    ${read("20260720143000_mirror_sales_805_appointments_to_crm_calendar.sql")}
    ${beforeAuthority}
    ${read("20260906145749_jessica_booking_authority.sql")}
    grant all on public.leads,public.crm_jobs,public.crm_quotes,public.crm_calendar_events,public.crm_availability_slots,public.sales_805_appointments to service_role;`;
}
