# 805 Shutters Google Workspace setup

Date: 2026-06-02

Goal: move business email for `805shutters.com` into Google Workspace / Gmail
without breaking the current website or losing inbound mail during DNS changes.

## Current DNS snapshot

Authoritative DNS is currently on HostGator:

```text
ns6291.hostgator.com
ns6292.hostgator.com
```

Current public mail records:

```text
805shutters.com. 14400 IN MX  0 805shutters.com.
805shutters.com. 14400 IN TXT "v=spf1 a mx include:websitewelcome.com ~all"
```

This means Gmail for `@805shutters.com` is not active yet. Do not change the A
or CNAME records for the website as part of the email cutover.

## Recommended Workspace choices

Start with Google Workspace Business Starter if the immediate need is business
Gmail, Calendar, Drive, and basic Meet. Business Standard is only worth choosing
up front if 805 needs larger Drive storage, shared drives, appointment booking
pages, meeting recording, or eSignature immediately.

Use the free `805shutters@gmail.com` account as the bootstrap owner/recovery
identity, but make the new Workspace operate on the domain:

```text
805shutters.com
```

Recommended minimum mailbox structure:

```text
hello@805shutters.com      primary public/admin mailbox
jessica@805shutters.com    Jessica's user mailbox
dmarc@805shutters.com      reporting alias or Google Group
postmaster@805shutters.com operations alias
```

For launch, use `hello@805shutters.com` as the public website, ad, and general
customer address. Add specialized aliases like `consultations@805shutters.com`
only if lead volume or routing needs justify them later.

## Access needed

- Google account access for signup and billing.
- A payment method for Google Workspace.
- HostGator/cPanel access for DNS zone edits.
- A recovery phone and recovery email controlled by the business owner.

Do not put passwords, payment details, recovery codes, or DNS verification
tokens in git, chat, or Codex memory.

## Signup sequence

1. Go to Google Workspace signup and choose "Use my own domain."
2. Enter `805shutters.com`.
3. Select the Workspace plan.
4. Create the first domain admin/user mailbox.
5. Add aliases or Groups for public inbound addresses before changing MX.
6. In Google Admin, copy the domain verification TXT record.
7. Add the verification TXT record in HostGator DNS.
8. Return to Google Admin and verify domain ownership.
9. Activate Gmail only after the needed users, aliases, and Groups exist.

## Current Google domain-release case

Google currently reports that `805shutters.com` is already attached to an older
Google Workspace or Cloud Identity account. The current Google Admin Toolbox
domain-release case is:

```text
Case/reference: 71907164
Contact email: 805shutters@gmail.com
Flow: contested / free up this domain
```

To prove domain ownership and continue the release, add either the CNAME or TXT
record below in HostGator DNS. Prefer the CNAME because it does not touch the
existing root SPF TXT record.

Preferred CNAME:

```text
Type:  CNAME
Host:  71907164
Value: google.com
TTL:   3600
```

Equivalent TXT alternative:

```text
Type:  TXT
Host:  @
Value: google-gws-recovery-domain-verification=71907164
TTL:   3600
```

After the record resolves, return to the Google Admin Toolbox ownership page
for case `71907164` and click `Check again`. Do not remove the record until the
Google request is confirmed on the next page.

## HostGator support handoff

On 2026-06-02 evening PT, HostGator chat was opened for `805shutters.com`.
Support reported that cPanel, WHMCS, and webmail access were temporarily blocked
by a HostGator security update, causing extended chat wait times.

The live support agent was given the DNS request above and asked to either add
the CNAME record or help recover DNS access. HostGator then required account
authentication with the account security PIN from:

```text
https://www.hostgator.com/my-account/account-center
```

This PIN must be entered by the account owner directly in the HostGator chat or
account portal. Do not paste the PIN into Codex or git.

## DNS cutover records

When Google Admin prompts for Gmail activation, replace the current MX record
with Google's MX record:

```text
Type:     MX
Host:     @
Priority: 1
Value:    smtp.google.com.
TTL:      default or 3600
```

Remove the old `MX 0 805shutters.com.` record during this step. Keeping both
old and new MX records can route mail unpredictably.

Update SPF after deciding whether HostGator or the current WordPress site still
sends mail as `@805shutters.com`.

Google-only sending:

```text
Type:  TXT
Host:  @
Value: v=spf1 include:_spf.google.com ~all
```

Transition record while HostGator/WordPress still sends domain mail:

```text
Type:  TXT
Host:  @
Value: v=spf1 include:_spf.google.com include:websitewelcome.com ~all
```

Use only one SPF TXT record for the root domain.

## Post-cutover authentication

After Gmail is active, wait 24 to 72 hours before generating DKIM in Google
Admin. Then add the generated TXT record in HostGator DNS. Google usually uses
this host unless a different selector is chosen:

```text
Type:  TXT
Host:  google._domainkey
Value: v=DKIM1; k=rsa; p=<google-generated-public-key>
```

After SPF and DKIM have been passing for at least 48 hours, add a monitoring
DMARC record:

```text
Type:  TXT
Host:  _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@805shutters.com; pct=100
```

Move DMARC to `quarantine` or `reject` only after legitimate website, CRM, ad,
and billing emails are confirmed to pass SPF or DKIM.

## Verification checklist

- `dig +short MX 805shutters.com` returns `smtp.google.com.`
- `dig +short TXT 805shutters.com` shows exactly one SPF record.
- Send an external test email to each public address.
- Reply from the domain mailbox and confirm delivery to Gmail, Outlook, and one
  non-Google account if available.
- Confirm website lead forms still reach the correct inbox or lead database.
- Confirm Google Admin shows Gmail active for `805shutters.com`.
- Generate and start DKIM authentication after the waiting period.
- Add DMARC monitoring after SPF/DKIM are stable.

## Official references

- Google Workspace pricing: `https://workspace.google.com/pricing.html`
- Choose a Workspace edition: `https://knowledge.workspace.google.com/admin/getting-started/editions/choose-your-google-workspace-edition`
- Set up Google Workspace MX records: `https://support.google.com/a/answer/6160342`
- Verify domain ownership with TXT: `https://support.google.com/a/answer/7026550`
- Set up SPF: `https://knowledge.workspace.google.com/admin/security/set-up-spf`
- Set up DKIM: `https://knowledge.workspace.google.com/admin/security/set-up-dkim`
- Set up DMARC: `https://knowledge.workspace.google.com/admin/security/set-up-dmarc`
