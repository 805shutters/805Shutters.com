/**
 * Workflow Runs — React Hooks
 *
 * Surfaces the workflow_runs table + v_workflow_health view for Playwright
 * automation workflows (3DB scheduler, 3DB ledger, Rockwood, Lowe's, etc).
 *
 * Mirrors the useAgentOps pattern with foreground-only React Query polling.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@mts/integrations/supabase/client";

// ============================================================
// Types
// ============================================================

export type WorkflowRunStatus = "ok" | "partial" | "fail" | "skipped" | "running";
export type WorkflowHealthColor = "green" | "yellow" | "red" | "stale";

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  account_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: WorkflowRunStatus;
  summary: string | null;
  details: Record<string, unknown>;
  items_processed: number;
  items_created: number;
  items_failed: number;
  error_screenshot_path: string | null;
  created_at: string;
}

export interface WorkflowHealthRow {
  workflow_id: string;
  latest_run_id: string | null;
  latest_status: WorkflowRunStatus | null;
  latest_started_at: string | null;
  latest_finished_at: string | null;
  latest_summary: string | null;
  latest_items_processed: number | null;
  latest_items_created: number | null;
  latest_items_failed: number | null;
  latest_error_screenshot: string | null;
  runs_24h: number;
  ok_24h: number;
  partial_24h: number;
  fail_24h: number;
  items_processed_24h: number;
  items_created_24h: number;
  items_failed_24h: number;
  runs_lifetime: number;
  ok_lifetime: number;
  partial_lifetime: number;
  fail_lifetime: number;
  skipped_lifetime: number;
  health_color: WorkflowHealthColor;
}

// ============================================================
// Query keys
// ============================================================

export const workflowRunsKeys = {
  all: ["workflow-runs"] as const,
  health: () => [...workflowRunsKeys.all, "health"] as const,
  runs: (workflowId: string | null, limit: number) =>
    [...workflowRunsKeys.all, "runs", workflowId ?? "all", limit] as const,
};

// ============================================================
// Hook: all-workflows health (view)
// ============================================================

export function useWorkflowHealth() {
  return useQuery({
    queryKey: workflowRunsKeys.health(),
    queryFn: async (): Promise<WorkflowHealthRow[]> => {
      const { data, error } = await supabase
        .from("v_workflow_health" as never)
        .select("*")
        .order("workflow_id", { ascending: true });
      if (error) throw new Error(`Failed to fetch workflow health: ${error.message}`);
      return (data as unknown as WorkflowHealthRow[]) ?? [];
    },
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

// ============================================================
// Hook: recent runs for a workflow (or all)
// ============================================================

export function useWorkflowRuns(workflowId: string | null, limit = 50) {
  return useQuery({
    queryKey: workflowRunsKeys.runs(workflowId, limit),
    queryFn: async (): Promise<WorkflowRun[]> => {
      let q = supabase
        .from("workflow_runs" as never)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (workflowId) q = q.eq("workflow_id", workflowId);
      const { data, error } = await q;
      if (error) throw new Error(`Failed to fetch workflow runs: ${error.message}`);
      return (data as unknown as WorkflowRun[]) ?? [];
    },
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

// ============================================================
// Utility: health color → Tailwind tokens
// ============================================================

export function healthColorToClasses(color: WorkflowHealthColor): {
  border: string;
  bg: string;
  text: string;
  dot: string;
  label: string;
} {
  switch (color) {
    case "green":
      return {
        border: "border-l-emerald-500",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        dot: "bg-emerald-500",
        label: "Healthy",
      };
    case "yellow":
      return {
        border: "border-l-amber-500",
        bg: "bg-amber-50",
        text: "text-amber-700",
        dot: "bg-amber-500",
        label: "Degraded",
      };
    case "red":
      return {
        border: "border-l-red-500",
        bg: "bg-red-50",
        text: "text-red-700",
        dot: "bg-red-500",
        label: "Failing",
      };
    case "stale":
      return {
        border: "border-l-gray-400",
        bg: "bg-gray-50",
        text: "text-gray-600",
        dot: "bg-gray-400",
        label: "Stale",
      };
  }
}

// ============================================================
// Utility: friendly workflow labels (no magic strings in UI)
// ============================================================

export const WORKFLOW_LABELS: Record<string, { name: string; brand: string }> = {
  "3db_scheduled": { name: "3DB Scheduler", brand: "3 Day Blinds" },
  "3db_scheduled_listener": { name: "3DB Scheduler Listener", brand: "3 Day Blinds" },
  "3db_ledger": { name: "3DB New Orders Ledger", brand: "3 Day Blinds" },
  "3db_new_jobs_codex": { name: "3DB New Jobs Import", brand: "3 Day Blinds" },
  "3db_keep_alive": { name: "3DB Portal Keepalive", brand: "3 Day Blinds" },
  "3db_new_jobs_health": { name: "3DB New Jobs Health", brand: "3 Day Blinds" },
  "3db_ready_to_schedule": { name: "3DB Ready-to-Schedule", brand: "3 Day Blinds" },
  "3db_ready_to_schedule_codex": { name: "3DB Ready-to-Schedule Import", brand: "3 Day Blinds" },
  "3db_ready_to_schedule_health": { name: "3DB Ready-to-Schedule Health", brand: "3 Day Blinds" },
  "3db_message": { name: "3DB Message Left", brand: "3 Day Blinds" },
  "3db_message_listener": { name: "3DB Message-Left Listener", brand: "3 Day Blinds" },
  "3db_card_creator": { name: "3DB Card Creator", brand: "3 Day Blinds" },
  "3db_norman_ship_notice": { name: "3DB Norman Ship Notice", brand: "3 Day Blinds" },
  "3db_norman_delivery": { name: "3DB Norman Delivery Tracker", brand: "3 Day Blinds" },
  "3db_norman_order_agent": { name: "3DB Norman Order Agent", brand: "3 Day Blinds" },
  quote_norman_order_entry: { name: "Quote Norman Order Entry", brand: "805/MTS Quotes" },
  rockwood_scheduled: { name: "Rockwood Scheduler", brand: "Rockwood" },
  rockwood_message: { name: "Rockwood Message Left", brand: "Rockwood" },
  rockwood_listener: { name: "Rockwood Listener", brand: "Rockwood" },
  graber_scheduled: { name: "Graber Scheduler", brand: "Graber" },
  graber_message: { name: "Graber Message Left", brand: "Graber" },
  graber_listener: { name: "Graber Listener", brand: "Graber" },
  lowes_ledger: { name: "Lowe's Ledger", brand: "Lowe's" },
  lowes_inspection: { name: "Lowe's Inspection", brand: "Lowe's" },
  portal_queue_reaper: { name: "Portal Queue Reaper", brand: "Supervisor" },
};

export function getWorkflowLabel(workflowId: string): { name: string; brand: string } {
  return WORKFLOW_LABELS[workflowId] ?? { name: workflowId, brand: "Unknown" };
}

// ============================================================
// Utility: relative time (reused from useAgentOps style)
// ============================================================

export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
