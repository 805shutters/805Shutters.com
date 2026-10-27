# Staff pickup repair — October 27, 2026

## Scope and plan
Owner requested a fresh audit after failed forwarding, explicitly requested repair, and selected staff-only Press 1 to connect. Dedicated 805 only; customers have no keypad requirement.

- Completed: audit deployed v36 and reconstruct the 11:13 Pacific call. Mike leg returned no-answer; Jessica leg returned machine_start. AMD callback returned200; neither leg transferred. The 11:18 retry ended before staff dial. Exact owner-reported call/handset remains unconfirmed.
- Completed: new offers use staff DTMF acceptance with at least40 seconds ringing plus dispatch grace, then a separate20-second confirmation window starting at pickup. No AMD is requested for new offers. Existing persisted offers retain their original acceptance path.
- Completed: signed, account/destination/SID-bound acceptance; one atomic winner; direct staff conference response; one caller redirect; duplicate, wrong-key, no-key, late, canceled and concurrent acceptance tests. Consult and callback room routing tested.
- Completed:174 service tests; npm test10639 passed,36 skipped; typecheck and build passed. Bundle syntax and diff checks passed. No test called real handsets or customers.
- Completed: source commit0abe688485002b57f30b5636ce643856dce2a7c2 pushed and remote main SHA verified. Production Edge v37 ACTIVE; exact158184-character source readback matches the tested bundle. Live health200 reports ready:true, missing:[], staffAcceptance:dtmf, ringStaff:mike/jessica. Unsigned acceptance rejected401.
- In progress: owner-controlled handset acceptance requested after release. No live two-way-audio success has been reported yet.
- Remaining: real forwarded pickup and two-way audio confirmation by owner.

## Release target and rollback
Supabase project evuxqsaucmvgyuvjpqlo, function voice-805. Application signature checks and existing verify_jwt=false remain intact. No schema, secret, Twilio account setting, incoming staff list or SMS configuration changes. Phone Edge bundle is the deployed runtime; no website UI change requires a Vercel release.

Tested bundle SHA256:924177274bf97eab2bc8d55546f536419cf9b66759ec9c119266f7bdfb5e3a50. Previous v36 source retained locally at artifacts/phone-pickup/rollback-v36.mjs. No active production calls at preflight.

Canonical checkout and other worktrees are preserved. Shared context pack already had drift/missing snapshot and oversized/credential-shaped handoff content; those unrelated local files are not included in this release.
