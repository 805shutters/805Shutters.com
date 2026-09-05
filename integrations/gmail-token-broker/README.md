# 805 Gmail authentication

The three 805 inbox workflows previously sent `access-token` to MTS's `gmail-oauth-repair`. That endpoint only implements interactive OAuth setup (`auth-url` and `exchange`), so recurring calls failed with HTTP 400/502.

This 805-owned service uses the existing **805shutters@gmail.com** inbox connection, which is the mailbox the existing filing and COGS workflows expect. It does not send email or change the 805 business sending account. It is hosted in `djduaqegxwjnmjlzjdor` beside the existing 805 OAuth client and mailbox token record; the dedicated 805 CRM database is not its deployment target.

## Contract and safety review

- POST JSON `{ "action": "access-token", "emailAddress": "805shutters@gmail.com" }`.
- Requires the exact dedicated `GMAIL_805_TOKEN_BROKER_SECRET` bearer credential (minimum 32 characters), checked before parsing requests or accessing OAuth credentials.
- Never accepts Supabase public/service keys as alternative authentication. Platform JWT verification is disabled because the handler enforces this dedicated service credential itself.
- Fixed mailbox, 805-only OAuth client variables, exact mailbox token lookup. No default or MTS mailbox fallback. A failed token lookup fails closed.
- Requires Gmail modify permission and verifies Google's profile identity before returning the short-lived access token.
- No refresh tokens or OAuth client secrets in responses, logs, source control, or browser configuration. Every response is `Cache-Control: no-store`. No CORS browser access.
- No database migration, email sending, or business-record mutation occurs in this broker. Existing processors retain their matching and application rules.

## Deployment

Run the focused broker tests, full unit suite, typecheck and build before release. The tested handler is `src/lib/crm/gmail-token-broker.ts`; the thin Deno entry is `integrations/gmail-token-broker/index.js`.

1. Provision `GMAIL_805_TOKEN_BROKER_SECRET` in the hosting Supabase project from a protected temporary file. The existing `GMAIL_805_CLIENT_ID`, `GMAIL_805_CLIENT_SECRET` and mailbox refresh-token record remain unchanged.
2. Run `node scripts/deploy_gmail_token_broker.mjs`. This stages only this function and its tested handler and pins the hosting project; it never deploys unrelated functions or migrations.
3. Verify denied requests (no credential, incorrect credential, another mailbox), then a successful authenticated token/profile check. Never print tokens.
4. In Vercel project `805`, production only, set `GMAIL_ACCESS_TOKEN_BROKER_URL` to `https://djduaqegxwjnmjlzjdor.supabase.co/functions/v1/gmail-805-token-broker`, `GMAIL_ACCESS_TOKEN_BROKER_ACTION` to `access-token`, and the matching `GMAIL_ACCESS_TOKEN_BROKER_SECRET` as a sensitive variable.
5. Redeploy the verified main revision so the new environment is applied. Run the three GitHub workflows and inspect response results, including auxiliary processor failures.

To fail closed during recovery, clear the broker action in Vercel and redeploy. Revert the dedicated function to its previous tested version for a future regression; do not add token operations to the public OAuth setup endpoint. Credentials must be transferred only through protected files/stdin and removed from temporary storage after verification.
