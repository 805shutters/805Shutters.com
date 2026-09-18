import { objectMeta } from "./measure-needed-state";

export type WholeJobParentKind = "job" | "quote" | "bookkeeping";
export type WholeJobRecord = { kind: WholeJobParentKind; id: string };

const wholeJobRecordPattern = /^whole-job-(job|quote|bookkeeping)-([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i;

export function wholeJobRecordId(kind: WholeJobParentKind, id: string) {
  return `whole-job-${kind}-${id}`;
}

export function parseWholeJobRecordId(value: string): WholeJobRecord | null {
  const match = wholeJobRecordPattern.exec(value);
  return match ? { kind: match[1].toLowerCase() as WholeJobParentKind, id: match[2] } : null;
}

export function wholeJobWorkflowChecks(meta: unknown) {
  return objectMeta(objectMeta(meta).whole_job_workflow_checks);
}
