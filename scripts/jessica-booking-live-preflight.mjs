// Read-only production preflight. Receives credentials in memory via `vercel env run`.
// Never prints credentials or customer locations. No writes, bookings or messages.
import { writeFile, mkdir } from "node:fs/promises";
const expected = "evuxqsaucmvgyuvjpqlo";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || new URL(url).hostname !== `${expected}.supabase.co` || !key)
  throw new Error("Dedicated 805 project credentials are required");
const headers = { apikey: key, Authorization: `Bearer ${key}` };
async function read(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Read-only database request failed: ${r.status}`);
  return r.json();
}
const schema = await read("");
const tables = [
  "leads",
  "crm_jobs",
  "crm_quotes",
  "crm_calendar_events",
  "sales_805_appointments",
  "crm_availability_slots",
  "crm_activity_events",
];
const report = {
  checkedAt: new Date().toISOString(),
  project: expected,
  columns: Object.fromEntries(
    tables.map((t) => [
      t,
      Object.fromEntries(
        Object.entries(schema.definitions?.[t]?.properties || {}).map(
          ([name, p]) => [name, { type: p.type, format: p.format }],
        ),
      ),
    ]),
  ),
  requiredLegacyFunctions: [
    "sales_805_appointment_calendar_start",
    "sales_805_appointment_calendar_end",
  ].map((name) => ({ name, present: Boolean(schema.paths?.[`/rpc/${name}`]) })),
  google: { configured: Boolean(process.env.GOOGLE_MAPS_API_KEY) },
  findings: [],
};
async function all(table, select) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const batch = await read(
      `${table}?select=${encodeURIComponent(select)}&order=id&limit=1000&offset=${offset}`,
    );
    rows.push(...batch);
    if (batch.length < 1000) return rows;
    if (offset > 99000) throw new Error("Preflight record limit exceeded");
  }
}
const crm = await all(
  "crm_calendar_events",
  "id,start_at,end_at,status,assigned_to,event_type,location,legacy_id:meta->>sales_805_appointment_id",
);
const legacy = await all(
  "sales_805_appointments",
  "id,appointment_date,start_time,end_time,status,assigned_to,customer_address",
);
const ranges = await all(
  "crm_availability_slots",
  "id,owner,start_at,end_at,status,source",
);
process.env.TZ = "America/Los_Angeles";
const legacyMap = new Map(legacy.map((e) => [e.id, e]));
const commitments = crm.map((e) => ({
  ...e,
  end_at:
    e.legacy_id &&
    (!legacyMap.get(e.legacy_id)?.end_time ||
      legacyMap.get(e.legacy_id).end_time <=
        legacyMap.get(e.legacy_id).start_time)
      ? null
      : e.end_at,
}));
for (const e of legacy)
  if (!crm.some((c) => c.legacy_id === e.id))
    commitments.push({
      id: `sales:${e.id}`,
      start_at: `${e.appointment_date}T${e.start_time}`,
      end_at:
        e.end_time > e.start_time
          ? `${e.appointment_date}T${e.end_time}`
          : null,
      status: e.status,
      assigned_to: e.assigned_to,
      event_type: "sales_consult",
      location: e.customer_address,
    });
const day = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(
    new Date(d),
  );
const affects = (e) =>
  e.event_type === "block" ||
  ["", "jessica", "unassigned"].includes(
    String(e.assigned_to || "")
      .trim()
      .toLowerCase(),
  );
const active = commitments.filter(
  (e) =>
    !["canceled", "cancelled"].includes(
      String(e.status).trim().toLowerCase(),
    ) &&
    (!e.end_at || Date.parse(e.end_at) >= Date.now()),
);
for (const e of active) {
  const start = Date.parse(e.start_at),
    end = Date.parse(e.end_at);
  if (
    affects(e) &&
    (!Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      (!e.location?.trim() && e.event_type !== "block"))
  )
    report.findings.push({
      issue: "incomplete_commitment",
      id: e.id,
      date: Number.isFinite(start) ? day(start) : null,
    });
  if (
    ["", "unassigned"].includes(
      String(e.assigned_to || "")
        .trim()
        .toLowerCase(),
    ) &&
    e.event_type !== "block"
  )
    report.findings.push({
      issue: "unassigned_owner",
      id: e.id,
      date: Number.isFinite(start) ? day(start) : null,
    });
  for (const other of active)
    if (
      e.id < other.id &&
      affects(e) &&
      affects(other) &&
      e.event_type !== "block" &&
      start < Date.parse(other.end_at) &&
      Date.parse(other.start_at) < end
    )
      report.findings.push({
        issue: "appointment_overlap",
        id: e.id,
        relatedId: other.id,
        date: day(start),
      });
}
const counts = new Map();
for (const e of active)
  if (e.event_type !== "block" && Number.isFinite(Date.parse(e.start_at))) {
    const d = day(e.start_at);
    counts.set(d, (counts.get(d) || 0) + 1);
  }
for (const [date, count] of counts)
  if (count > 4)
    report.findings.push({ issue: "over_daily_capacity", date, count });
report.inventory = {
  crmRecords: crm.length,
  legacyRecords: legacy.length,
  deduplicatedCommitments: commitments.length,
  futureCommitments: active.length,
  availabilityRecords: ranges.length,
  existingJessicaAvailable: ranges.filter(
    (r) => r.owner === "Jessica" && r.status === "available",
  ).length,
};
if (process.env.GOOGLE_MAPS_API_KEY) {
  const common = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
  };
  const departureTime = new Date(Date.now() + 86400000).toISOString();
  const r = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        ...common,
        "X-Goog-FieldMask": "routes.duration,fallbackInfo",
      },
      body: JSON.stringify({
        origin: {
          location: { latLng: { latitude: 34.2164, longitude: -119.0376 } },
        },
        destination: {
          location: { latLng: { latitude: 34.1975, longitude: -119.1771 } },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        trafficModel: "BEST_GUESS",
        departureTime,
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = await r.json();
  report.google.routes = {
    httpStatus: r.status,
    trafficDurationReturned: Boolean(result.routes?.[0]?.duration),
    fallback: Boolean(result.fallbackInfo),
    reason:
      result.error?.details?.find((d) => d.reason)?.reason ||
      result.error?.status ||
      null,
  };
  const p = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      ...common,
      "X-Goog-FieldMask": "places.addressComponents,places.location",
    },
    body: JSON.stringify({
      textQuery: "601 Carmen Drive, Camarillo, CA",
      regionCode: "US",
      languageCode: "en",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const place = await p.json();
  const types = new Set(
    place.places?.[0]?.addressComponents?.flatMap((c) => c.types),
  );
  report.google.places = {
    httpStatus: p.status,
    validated:
      place.places?.length === 1 &&
      types.has("street_number") &&
      types.has("route"),
    reason:
      place.error?.details?.find((d) => d.reason)?.reason ||
      place.error?.status ||
      null,
  };
}
const dir = new URL("../artifacts/booking-authority/", import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(
  new URL("production-preflight.json", dir),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      checkedAt: report.checkedAt,
      project: expected,
      inventory: report.inventory,
      requiredLegacyFunctions: report.requiredLegacyFunctions,
      google: report.google,
      findings: report.findings,
    },
    null,
    2,
  ),
);
