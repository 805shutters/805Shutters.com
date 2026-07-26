export type CrmFeedbackStatus =
  | "clarifying"
  | "ready_for_implementation_approval"
  | "implementation_approved"
  | "implementing"
  | "ready_for_deployment_approval"
  | "deployment_approved"
  | "deploying"
  | "completed"
  | "rejected";

export type CrmFeedbackMessage = {
  id: string;
  created_at: string;
  request_id: string;
  author_type: "jessica" | "hermes" | "michael" | "system";
  author_email: string | null;
  body: string;
  revision: number;
  metadata: Record<string, unknown>;
};

export type CrmFeedbackRequest = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  created_by_email: string;
  title: string;
  description: string;
  status: CrmFeedbackStatus;
  revision: number;
  hermes_assessment: Record<string, unknown> | null;
  proposed_work: Record<string, unknown> | null;
  verification_evidence: Record<string, unknown> | null;
  implementation_approved_at: string | null;
  implementation_approved_by: string | null;
  implementation_completed_at: string | null;
  deployment_approved_at: string | null;
  deployment_approved_by: string | null;
  completed_at: string | null;
  willie_message_id: number | null;
  willie_notification_error: string | null;
  messages: CrmFeedbackMessage[];
};

export const activeCrmFeedbackStatuses: CrmFeedbackStatus[] = [
  "clarifying",
  "ready_for_implementation_approval",
  "implementation_approved",
  "implementing",
  "ready_for_deployment_approval",
  "deployment_approved",
  "deploying"
];

export function feedbackStatusLabel(status: CrmFeedbackStatus) {
  return {
    clarifying: "Clarifying with Hermes",
    ready_for_implementation_approval: "Waiting for Michael to approve implementation",
    implementation_approved: "Implementation approved",
    implementing: "Hermes is implementing",
    ready_for_deployment_approval: "Waiting for Michael to approve push/deployment",
    deployment_approved: "Push/deployment approved",
    deploying: "Deploying",
    completed: "Completed",
    rejected: "Not approved"
  }[status];
}
