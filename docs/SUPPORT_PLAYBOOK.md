# ChicMagnolia private beta support playbook

Use these replies as starting points, not automatic promises. Read the stored support request
and check the relevant Supabase, Vercel, Stripe, Resend or retailer records before responding.
Never ask for a password, authentication code, API key, session cookie or full payment-card
number.

## Triage priorities

Respond in this order:

1. suspected security issue or unauthorised account access;
2. continuing billing after the user tried to cancel or delete the account;
3. privacy-rights request or inability to delete/export data;
4. account access and authentication;
5. retailer price or stock discrepancy;
6. general feedback.

Record the request status as `in_progress` when investigation starts and `resolved` only after
the user has a clear answer or the required action is complete.

## Information that is safe to request

Depending on the issue, ask only for:

- the support request reference;
- the account email address already used in the request;
- the affected product URL;
- saved colour and saved size;
- expected result and actual ChicMagnolia result;
- approximate date and time of the action;
- a screenshot with personal information, cookies and payment details removed;
- Stripe invoice or subscription ID when visible to the user, but never a full card number.

## Retailer price or stock check failure

Subject: `We are checking the retailer result`

```text
Hi [Name],

Thanks for reporting this. I’m checking the retailer page and the exact variant that you saved.

Please reply with the product URL, saved colour, saved size, the price or stock result shown by ChicMagnolia, and what the retailer page showed at approximately the same time. A screenshot is helpful if it does not contain login details, cookies or payment information.

Retailer pages can change or block automated access, so I will compare the current page structure, pause the affected adapter if it is producing unsafe results, and add a regression test before re-enabling any repaired parser.

Your support reference is [Reference].

Best,
Sevinj
ChicMagnolia
```

After responding:

- reproduce against the exact URL and variant;
- inspect `last_check_error` and the latest `price_checks` row;
- compare direct, Browserless and Oxylabs output only for the retailer routes that use them;
- never substitute another colour or size;
- pause the adapter when a false price or false in-stock result could cause user harm;
- add a fixture-based regression test before deploying the repair.

## Billing access or subscription status

Subject: `We are checking your ChicMagnolia billing access`

```text
Hi [Name],

Thanks for letting me know. I’m checking the Stripe sandbox/live environment, webhook delivery and the subscription status linked to your ChicMagnolia account.

Please send the approximate time of Checkout or cancellation and any invoice or subscription reference visible in Stripe. Do not send your card number, CVC, password or authentication code.

I will confirm whether the subscription is active, cancelling at period end, cancelled or awaiting a webhook update, and I will not ask you to pay again while the status is being investigated.

Your support reference is [Reference].

Best,
Sevinj
ChicMagnolia
```

Checks:

- confirm Stripe mode before any action;
- find the customer by email and compare customer/subscription IDs with Supabase;
- review signed webhook delivery and `stripe_webhook_events`;
- do not grant access from a Checkout return URL alone;
- do not create a second subscription to repair a delayed webhook;
- replay only a signed relevant event after confirming idempotency.

## Account deletion issue

Subject: `We are checking your account-deletion request`

```text
Hi [Name],

Thanks for contacting ChicMagnolia. I’m checking whether the account, user-owned application data and any linked Stripe customer were removed successfully.

Please confirm the email address used for the account and the approximate time you submitted deletion. Do not send your password or any payment-card details.

If deletion completed, the old credentials should no longer sign in. Some limited billing, fraud-prevention, security or support records may remain where retention is legally required or needed to handle the request; the Privacy notice explains this distinction.

Your support reference is [Reference].

Best,
Sevinj
ChicMagnolia
```

Checks:

- confirm the Supabase auth user no longer exists;
- confirm user-owned profile, purchases, checks, notifications, legal acceptances and
  subscription state were removed by cascade;
- confirm Stripe customer deletion ended the active sandbox/live subscription as applicable;
- confirm a support request was retained only with `user_id = null` when still needed;
- confirm delayed webhooks did not recreate subscription state.

## Account access or missing verification email

Subject: `Help with your ChicMagnolia account`

```text
Hi [Name],

I’m checking the authentication and email-delivery records for your account.

Please confirm the email address you used and whether this concerns signup confirmation,
password reset or an existing login. Also check Spam and Promotions. Do not forward the
verification link, password-reset link, password or authentication code.

If the link has expired, request a new one from the same browser and device where possible.
I will check Supabase Auth and Resend delivery status without asking for access to your inbox.

Your support reference is [Reference].

Best,
Sevinj
ChicMagnolia
```

Checks:

- confirm the sender is `auth@notify.chicmagnolia.com`;
- review Supabase Auth logs and Resend delivery status;
- verify the callback returns to the trusted initiating origin;
- distinguish email confirmation from automatic PKCE sign-in;
- never manually mark an address verified without a documented reason.

## Privacy request

Subject: `Your ChicMagnolia privacy request`

```text
Hi [Name],

Thank you for your privacy request. I have recorded it under reference [Reference].

Please tell me whether you are requesting access, correction, deletion, restriction,
objection or portability. To protect the account, I may need to verify that the request comes
from the account holder, but I will not ask for your password, authentication code or full
payment-card details.

The Settings page already provides a JSON export and self-service account deletion. If those
tools do not address the request, I will explain the next step and expected response time.

Best,
Sevinj
ChicMagnolia
```

Checks:

- keep the request private and mark it `in_progress`;
- verify identity proportionately;
- export only the requester's data;
- check provider-retained billing or compliance records before promising complete erasure;
- document the response and completion date.

## Security report

Subject: `ChicMagnolia security report received`

```text
Hi [Name],

Thank you for reporting this privately. I have recorded the report under reference [Reference]
and will review the affected feature and potential impact.

Please provide the affected URL, minimal reproduction steps and the impact you believe is
possible. Remove secrets and personal data from screenshots or examples. Do not access another
user's data, run high-volume scans or perform denial-of-service testing.

I will acknowledge material updates as the investigation progresses. Please avoid publishing
the issue until it has been assessed and repaired.

Best,
Sevinj
ChicMagnolia
```

Immediate actions:

- preserve logs and timestamps;
- rotate a credential only when exposure is credible;
- restrict or disable the smallest affected feature;
- follow `docs/ROLLBACK.md` when user harm is ongoing;
- add a regression test and document the root cause before closure.

## Notification failure recovery

Support storage happens before Resend notification. At least daily during the private beta:

```sql
select id, topic, email, created_at, notification_error
from public.support_requests
where notification_status = 'failed'
order by created_at asc;
```

For each failed row:

1. confirm the request is legitimate;
2. contact the user using a monitored account without exposing private infrastructure;
3. repair or retry the Resend automation;
4. update `notification_status`, `notification_error` and request `status` accurately;
5. never delete an unresolved request merely to clear the queue.

## Daily founder review

During the first two beta weeks, review:

- new and in-progress `support_requests`;
- failed support notifications;
- failed price checks by retailer;
- failed Resend price alerts;
- failed Stripe webhook events;
- authentication delivery failures;
- Oxylabs and Browserless usage and spend.

A fast reply is useful, but a precise reply is more important. Do not promise a refund,
retailer return outcome, price match or data-erasure scope until the relevant records and
legal obligations have been checked.
