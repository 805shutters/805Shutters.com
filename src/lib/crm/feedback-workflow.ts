import type { CrmFeedbackRequest, CrmFeedbackStatus } from "./feedback-types";

export type FeedbackApprovalType = "implementation" | "deployment";

export function expectedApprovalStatus(type: FeedbackApprovalType): CrmFeedbackStatus {
  return type === "implementation"
    ? "ready_for_implementation_approval"
    : "ready_for_deployment_approval";
}

export function approvedFeedbackStatus(type: FeedbackApprovalType): CrmFeedbackStatus {
  return type === "implementation" ? "implementation_approved" : "deployment_approved";
}

export function assertTopicApprovalAllowed(
  request: Pick<CrmFeedbackRequest, "status" | "revision">,
  type: FeedbackApprovalType,
  callbackRevision: number
) {
  if (!Number.isInteger(callbackRevision) || callbackRevision !== request.revision) {
    throw new Error("This approval button is stale for the current topic revision.");
  }
  if (request.status !== expectedApprovalStatus(type)) {
    throw new Error(`This topic is not waiting for ${type} approval.`);
  }
}

export function feedbackCallbackData(id: string, revision: number, type: FeedbackApprovalType) {
  return `feedback:${id}:${revision}:${type}`;
}

export function parseFeedbackCallbackData(value: string) {
  const match = /^feedback:([0-9a-f-]{36}):(\d+):(implementation|deployment)$/.exec(value);
  if (!match) return null;
  return {
    id: match[1],
    revision: Number(match[2]),
    type: match[3] as FeedbackApprovalType
  };
}
