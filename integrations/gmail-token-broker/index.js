import { handle805GmailTokenRequest } from "../../src/lib/crm/gmail-token-broker.ts";

Deno.serve((request) => handle805GmailTokenRequest(request, {
  env: (name) => Deno.env.get(name),
  fetch,
}));
