# Signed-contract installer packets

Approved destination: **wcbot@mail.grokbot.com**.
Sender: **805 Shutters <805@805shutters.com>**.

Every eligible signed contract uses the existing installer delivery queue and the
same base packet template. Customer/shop notification settings do not suppress
this packet. Historical/test/excluded records keep their existing exclusions.

## Standard packet

Subject: `805 Shutters Installation Form — {customer name}`

The email identifies the customer, contract number, installation address,
remaining customer balance, installation line count, and editable technician
form link. Its PDF contains customer contact details, contract number, remaining
balance, and each room's products, styles, quantities and saved options, plus
issue reporting and installer sign-off. Line-item prices stay redacted.

When the technical-measure/no-measure handoff becomes available, the existing
versioned follow-up uses the same destination and includes the installation PDF,
canonical handoff JSON and SHA-256 sidecar. Do not invent unavailable measurements
or attach an unredacted customer contract as a substitute.

## Release and delivery verification

Apply `20261018190429_grok_installer_packet_recipient.sql` with the matching
application release. It changes the queue default and regenerates only old-address
packets that have never been attempted and hold no lease. Sent, accepted, uncertain
and leased rows retain their original recipient and evidence. Old frozen attempts
require reconciliation instead of silently redirecting or resending them.

After release, verify the next authorized real signing produces the base packet
with the exact quote/form IDs, Grok recipient, frozen attachment and idempotency
key, then verify provider message ID and sent state. Never create a synthetic
customer signature or replay historical signed contracts to test delivery.

Local tests prove routing and queue behavior; they do not prove a production
migration, deployment or receipt in the Grok mailbox.
