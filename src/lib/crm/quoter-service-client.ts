import { QUOTER_FRONT_DOOR_ROUTES } from "@/lib/crm/quoter-service-auth";

/**
 * Client contract for the Quoter bot.
 * Before any write, make one read call to check the token.
 * On a 401 or 403, retry that call once. If it fails again, stop and report.
 * Do not send the write after a failed token check.
 *
 * The read is GET /api/crm/quote-front-door/customers with no search params.
 * That route does not create a customer and does not save a draft.
 */

export const QUOTER_TOKEN_PROBE = {
  method: "GET" as const,
  path: QUOTER_FRONT_DOOR_ROUTES[0],
};

export type QuoterHttpResult = {
  status: number;
  body?: unknown;
};

export type QuoterCallReport = {
  stopped: boolean;
  wrote: boolean;
  probeAttempts: number;
  writeAttempts: number;
  status: number | null;
  message: string;
  result?: QuoterHttpResult;
};

export async function runQuoterFrontDoorCall(input: {
  probe: () => Promise<QuoterHttpResult>;
  write?: () => Promise<QuoterHttpResult>;
}): Promise<QuoterCallReport> {
  const probe = await attemptAuth(input.probe);
  if (probe.stopped) {
    return {
      stopped: true,
      wrote: false,
      probeAttempts: probe.attempts,
      writeAttempts: 0,
      status: probe.status,
      message: probe.authFailure
        ? "Quoter token check failed after one retry. No write was sent."
        : "Quoter token check did not succeed. No write was sent.",
      result: probe.result,
    };
  }
  if (!input.write) {
    return {
      stopped: false,
      wrote: false,
      probeAttempts: probe.attempts,
      writeAttempts: 0,
      status: probe.status,
      message: "Quoter token check succeeded.",
      result: probe.result,
    };
  }
  const write = await attemptAuth(input.write);
  if (write.stopped) {
    return {
      stopped: true,
      wrote: true,
      probeAttempts: probe.attempts,
      writeAttempts: write.attempts,
      status: write.status,
      message: write.authFailure
        ? "Quoter write was refused after one retry."
        : "Quoter write did not succeed.",
      result: write.result,
    };
  }
  return {
    stopped: false,
    wrote: true,
    probeAttempts: probe.attempts,
    writeAttempts: write.attempts,
    status: write.status,
    message: "Quoter request finished.",
    result: write.result,
  };
}

async function attemptAuth(call: () => Promise<QuoterHttpResult>) {
  let result = await call();
  let attempts = 1;
  if (isAuthFailure(result.status)) {
    result = await call();
    attempts += 1;
    if (isAuthFailure(result.status)) {
      return { stopped: true, authFailure: true, attempts, status: result.status, result };
    }
  }
  if (!isSuccess(result.status)) {
    return { stopped: true, authFailure: false, attempts, status: result.status, result };
  }
  return { stopped: false, authFailure: false, attempts, status: result.status, result };
}

function isAuthFailure(status: number) {
  return status === 401 || status === 403;
}

function isSuccess(status: number) {
  return status >= 200 && status < 300;
}
