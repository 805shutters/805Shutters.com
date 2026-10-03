# In-house three-month payments

V2 quotes default to standard terms. Staff select **In-house 3-month payments** and save before sending. Changing sent terms creates a separate editable revision using the existing saved-price copier. Signed terms cannot be changed by this control.

The accepted final total is split in integer cents. Deposit and month 2 each receive the floor of one-third; payment 3 receives the remainder. All three installments are created atomically by native acceptance, for the accepted alternative and selected products only. No historical agreements are converted.

The existing bookkeeping receipt ledger remains the revenue authority. Tracking allocates those receipts rather than creating additional revenue. Staff can record an identified partial or early installment receipt from **In-house payment tracking** in the quote, contract, Bookkeeping, or Job Tracking. Enter the actual received date. A stable request ID protects receipt retries. Square reconciliation matches exact order and payment IDs; repeated events do not add a second credit.

The receipt that completes the deposit anchors later dates in America/Los_Angeles. January 31 becomes February 28 (29 in leap years), then March 31. Installation does not change these dates. Refunds, deleted/changed receipts, altered credits, and changed agreed totals hold collection for review. Restoring original evidence allows staff to resume; changed agreements require customer-reviewed terms. Pause and cancel retire known checkout links. Unavailable retirement is shown to staff and retried by the scheduled processor.

The separate `/api/cron/in-house-payments/` handler runs hourly at minute 17. It requires CRON_SECRET and sends only from 9 a.m. through 5:59 p.m. Los Angeles time. Unpaid payments 2 and 3 receive email and text at three days before and on the due date. Every stage/channel has a unique record. Opt-outs are checked immediately before sending. There are no automatic customer reminders after the due day; staff must review the exact recipients, amount, link, and messages before a resend. Mike receives an overdue alert the next day and once per subsequent week.

Email is sent from 805@805shutters.com via Resend. SMS uses the configured 805 Twilio sender and includes STOP instructions. Twilio status callbacks validate the signature and exact notification/message ID. Resend delivery status is polled for provider evidence. Accepted, delivered, failed, skipped, and uncertain outcomes remain distinct. Uncertain SMS acceptance is never retried automatically. Only explicitly rejected rate-limit responses can retry, at most three attempts.

The service-only `crm_in_house_*` tables and RPCs have explicit permissions and RLS. Public access uses the contract share token and the exact accepted CRM quote; it cannot enroll a different agreement or charge a stored card. The old job-meta payment-plan handler retains its original terms and processing.

## Verification

Focused tests cover cents, month ends, leap years, LA dates, partial deposits, receipt anchoring, early payments, repeated reconciliation, evidence holds, migration permissions, native selected-product acceptance, sent revisions, standard terms, reminder/channel deduplication, opt-outs, provider uncertainty, callback identity, and overdue alerts. The local Playwright fixture runs real schedule/tracking/contract components at phone (390), iPad (820), and desktop (1440) widths, with synthetic API responses. Database tests execute actual migrations and native RPCs in isolated PGlite.

Production validation must use labeled synthetic records and explicitly approved test recipients. No test charges or automatic card charging are required. Apply the database migration before deploying the new application. Check the authenticated save/reload workflow, accepted quote identity, exact deposit checkout amount, receipt tracking, reminder status, and legacy processing in Vercel project 805.
