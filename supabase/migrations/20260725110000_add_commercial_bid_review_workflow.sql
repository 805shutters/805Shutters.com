alter table public.crm_commercial_accounts
drop constraint if exists crm_commercial_accounts_status_check;

alter table public.crm_commercial_accounts
add constraint crm_commercial_accounts_status_check check (
  status in (
    'review_needed', 'new', 'researching', 'ready', 'contacted', 'replied',
    'meeting', 'bid_invited', 'bidding', 'won', 'nurture', 'not_fit',
    'do_not_contact'
  )
);

alter table public.crm_commercial_activities
drop constraint if exists crm_commercial_activities_type_check;

alter table public.crm_commercial_activities
add constraint crm_commercial_activities_type_check check (
  activity_type in (
    'created', 'research', 'note', 'call', 'email_sent', 'reply_received',
    'meeting', 'bid_invite', 'estimate_review', 'bid_submitted',
    'status_change', 'opt_out'
  )
);

drop index if exists public.crm_commercial_activities_gmail_message_uidx;

create unique index if not exists crm_commercial_activities_account_gmail_message_uidx
on public.crm_commercial_activities (account_id, gmail_message_id)
where gmail_message_id is not null;

create index if not exists crm_commercial_accounts_bid_review_idx
on public.crm_commercial_accounts (status, next_action_due)
where status = 'review_needed';
