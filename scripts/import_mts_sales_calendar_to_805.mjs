#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const IMPORT_SOURCE = "mts_805_sales_calendar";
const BOOKKEEPING_SOURCE = "mts_805_bookkeeping";
const DEFAULT_SOURCE_FILE = "/tmp/mts-805-sales-appointments-export.json";

loadEnv(".env.local");

const dryRun = process.argv.includes("--dry-run");
const sourceFile = argValue("--source") || DEFAULT_SOURCE_FILE;
const targetUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!targetUrl || !targetKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!fs.existsSync(sourceFile)) {
  console.error(`Missing appointment export: ${sourceFile}`);
  process.exit(1);
}

const target = createClient(targetUrl, targetKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const exportPayload = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
const appointments = exportPayload.rows || [];
const quoteJobMap = await loadQuoteJobMap();
const results = {
  dryRun,
  sourceFile,
  appointments: appointments.length,
  eventsInserted: 0,
  eventsUpdated: 0,
  jobsCreatedOrUpdated: 0,
  linkedQuoteJobs: 0
};

for (const appointment of appointments) {
  const startAt = zonedTimeToUtc(appointment.appointment_date, timePart(appointment.start_time)).toISOString();
  const endAt = endIso(appointment.appointment_date, appointment.start_time, appointment.end_time);
  let jobId = appointment.quote_id ? quoteJobMap.get(`quote:${appointment.quote_id}`) || null : null;

  if (jobId) {
    results.linkedQuoteJobs += 1;
    if (!dryRun) await updateLinkedQuoteJob(jobId, appointment, startAt, endAt);
  } else if (!dryRun) {
    const job = await upsertAppointmentJob(appointment, startAt, endAt);
    jobId = job.id;
    results.jobsCreatedOrUpdated += 1;
  } else {
    results.jobsCreatedOrUpdated += 1;
  }

  const eventRecord = {
    job_id: jobId,
    title: appointment.customer_name || "805 sales appointment",
    event_type: "sales_consult",
    status: mapEventStatus(appointment.status),
    assigned_to: appointment.assigned_to || "Jessica",
    start_at: startAt,
    end_at: endAt,
    location: appointment.customer_address || null,
    notes: appointment.notes || null,
    meta: {
      imported_from: "MTS 805 sales appointments",
      imported_at: new Date().toISOString(),
      suppress_alerts: true,
      mts_appointment_id: appointment.id,
      mts_quote_id: appointment.quote_id || null,
      customer_name: appointment.customer_name || null,
      customer_phone: appointment.customer_phone || null,
      customer_phone_normalized: appointment.customer_phone_normalized || null,
      appointment_date: appointment.appointment_date,
      start_time: appointment.start_time,
      end_time: appointment.end_time,
      source: appointment.source || null,
      created_by: appointment.created_by || null,
      source_metadata: appointment.metadata || {}
    }
  };

  if (dryRun) {
    results.eventsInserted += 1;
    continue;
  }

  const existing = await findExistingEvent(appointment.id);
  if (existing?.id) {
    const { error } = await target.from("crm_calendar_events").update(eventRecord).eq("id", existing.id);
    if (error) fail("Failed to update crm_calendar_events", error);
    results.eventsUpdated += 1;
  } else {
    const { error } = await target.from("crm_calendar_events").insert(eventRecord);
    if (error) fail("Failed to insert crm_calendar_events", error);
    results.eventsInserted += 1;
  }
}

console.log(JSON.stringify(results, null, 2));

async function loadQuoteJobMap() {
  const map = new Map();
  const { data, error } = await target
    .from("crm_jobs")
    .select("id, external_id")
    .eq("external_source", BOOKKEEPING_SOURCE)
    .like("external_id", "quote:%");

  if (error) fail("Failed to load imported quote jobs", error);
  for (const row of data || []) map.set(row.external_id, row.id);
  return map;
}

async function updateLinkedQuoteJob(jobId, appointment, startAt, endAt) {
  const { error } = await target
    .from("crm_jobs")
    .update({
      status: mapJobStatus(appointment.status),
      sales_owner: appointment.assigned_to || "Jessica",
      next_action: "Prepare for sales appointment",
      next_action_due: appointment.appointment_date,
      appointment_start: startAt,
      appointment_end: endAt
    })
    .eq("id", jobId);

  if (error) fail("Failed to update linked crm_jobs appointment fields", error);
}

async function upsertAppointmentJob(appointment, startAt, endAt) {
  const row = {
    external_source: IMPORT_SOURCE,
    external_id: `appointment:${appointment.id}`,
    source: appointment.source || "mts_sales_calendar_import",
    status: mapJobStatus(appointment.status),
    priority: "normal",
    customer_name: appointment.customer_name || "805 sales appointment",
    phone: appointment.customer_phone || appointment.customer_phone_normalized || "unknown",
    email: null,
    address: appointment.customer_address || null,
    city: null,
    product_interest: "consultation",
    sales_owner: appointment.assigned_to || "Jessica",
    next_action: "Prepare for sales appointment",
    next_action_due: appointment.appointment_date,
    appointment_start: startAt,
    appointment_end: endAt,
    estimated_total: 0,
    deposit_paid: 0,
    notes: appointment.notes || null,
    meta: {
      imported_from: "MTS 805 sales appointments",
      mts_appointment_id: appointment.id,
      mts_quote_id: appointment.quote_id || null,
      customer_phone_normalized: appointment.customer_phone_normalized || null,
      source_metadata: appointment.metadata || {}
    }
  };

  const { data, error } = await target
    .from("crm_jobs")
    .upsert(row, { onConflict: "external_source,external_id" })
    .select("*")
    .single();

  if (error || !data) fail("Failed to upsert crm_jobs appointment", error);
  return data;
}

async function findExistingEvent(mtsAppointmentId) {
  const { data, error } = await target
    .from("crm_calendar_events")
    .select("id")
    .contains("meta", { mts_appointment_id: mtsAppointmentId })
    .maybeSingle();

  if (error) fail("Failed to find existing crm_calendar_events row", error);
  return data;
}

function mapEventStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "cancelled" || normalized === "canceled") return "canceled";
  if (normalized === "completed" || normalized === "complete") return "complete";
  if (normalized === "rescheduled") return "rescheduled";
  return "scheduled";
}

function mapJobStatus(value) {
  const status = mapEventStatus(value);
  if (status === "complete") return "closed";
  if (status === "canceled") return "lost";
  return "scheduled";
}

function endIso(date, startTime, endTime) {
  const start = zonedTimeToUtc(date, timePart(startTime));
  const rawEnd = endTime ? zonedTimeToUtc(date, timePart(endTime)) : null;
  const end = rawEnd && rawEnd > start ? rawEnd : new Date(start.getTime() + 60 * 60 * 1000);
  return end.toISOString();
}

function timePart(value) {
  return String(value || "09:00").slice(0, 5);
}

function formatParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function zonedTimeToUtc(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetTime = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = new Date(targetTime);

  for (let index = 0; index < 3; index += 1) {
    const parts = formatParts(utc);
    const actual = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    utc = new Date(utc.getTime() - (actual - targetTime));
  }

  return utc;
}

function argValue(name) {
  const found = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : null;
}

function fail(message, error) {
  console.error(message, error);
  process.exit(1);
}

function loadEnv(file) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) return;
  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
