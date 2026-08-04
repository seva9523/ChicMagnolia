# Private beta invitations

Chic Magnolia uses personal, single-use invitation links for the founder-supported private beta.
Invitation access is free and is stored separately from Stripe subscription state. Stripe remains
in sandbox/test mode until the separate paid-launch gates are complete.

## Security model

- The plaintext invitation token appears only in the generated link.
- PostgreSQL stores only a SHA-256 hash of the token.
- Invitations can be bound to one normalized email address.
- Each invitation has an expiry and can be redeemed once.
- The invited email is cleared from the invitation record after successful redemption.
- `beta_invites` has RLS enabled and no browser-facing policy.
- `beta_access_grants` allows a signed-in user to read only their own grant.
- Browser roles cannot create, change or delete invitation or grant records.
- `redeem_beta_invite` is executable only by the service role.

## Create an invitation

Apply the migration first:

```text
supabase/migrations/202608040001_create_private_beta_access.sql
```

Run the generator only in a trusted local environment where the existing Supabase server
credentials are already available:

```bash
npm run beta:invite -- shopper@example.com 14
```

The second argument is the invitation expiry in days and must be from 1 to 90. The command prints
one invitation link. Share it privately with the intended person. Do not place invitation links in
public posts, analytics tools, issue trackers or support screenshots.

## User journey

1. The user opens their personal `/sign-up?invite=...` link.
2. They enter the same email address that received the invitation.
3. The server validates the invitation before creating the Supabase Auth user.
4. After Auth creates the user, the service-role-only database function redeems the invitation
   and creates the beta access grant.
5. If grant creation fails, the newly created Auth user is deleted as a rollback.
6. The user confirms their email and signs in.
7. Dashboard purchase creation, manual checks and daily monitoring accept either an active beta
   grant or an active/trialing Stripe subscription.

## Operations

To revoke access without deleting an account, set `revoked_at` on the user's
`beta_access_grants` row using a trusted service-role operation. Do not expose a browser update
policy.

To revoke an unused invitation, set `revoked_at` on its `beta_invites` row. Never store or recover
the plaintext token; create a replacement invitation instead.

Review these daily during the first two weeks:

- invitation redemption failures;
- sign-up confirmation delivery;
- active grant count;
- failed price checks;
- price-drop email failures;
- support requests.

## Account deletion

Deleting an Auth user cascades deletion through `beta_access_grants`. The redeemed invitation
keeps its non-personal redemption timestamp and loses the user link through `on delete set null`.
The original invited email has already been cleared at redemption.

## Paid launch boundary

Do not convert beta grants into fake Stripe subscriptions. When live billing is eventually
approved, keep the two access sources separate and decide explicitly how active beta users move to
the paid plan. Referral credits are a later billing feature and should be granted only after a
referred customer's successful live payment.
