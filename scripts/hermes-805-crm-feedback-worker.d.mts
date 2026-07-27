export const CrmFeedbackClient: any;
export function createExternalEventId(request: any, action: string): string;
export function parseHermesDecision(raw: string): any;
export function processRequest(request: any, options: any): Promise<any>;
export function redactError(error: unknown, secrets?: string[]): string;
export function runApprovedImplementation(request: any, options?: any): Promise<any>;
export function runApprovedDeployment(request: any, options?: any): Promise<any>;
export function validateWorkspace(authorizedWorkspace: string, requestedWorkspace: string): string;
