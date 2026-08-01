# Security policy

## Supported version

The current production deployment from `main` is the only supported version during the
private beta.

## Reporting a vulnerability

Please report suspected security issues privately through the
[ChicMagnolia support form](https://chicmagnolia.com/support) and select **Security report**.

Include:

- the affected URL or feature;
- the steps needed to reproduce the issue;
- the impact you believe is possible;
- screenshots or a minimal proof of concept with secrets and personal data removed.

Do not:

- publish the issue before it has been investigated;
- access another user's data;
- perform denial-of-service, high-volume scanning or social engineering;
- test with real payment-card data;
- include passwords, Supabase keys, Stripe keys or session cookies in the report.

ChicMagnolia will acknowledge a report as soon as reasonably possible, investigate it and
provide an update when the issue is understood. Good-faith reports that respect these rules
will not be treated as abuse.

## Operational security

Secrets must remain in Vercel or GitHub secret storage. `.env`, `.env.local`, build output,
`node_modules`, credentials and temporary diagnostic files must never be committed.
