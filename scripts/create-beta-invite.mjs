import { createHash, randomBytes } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const email = String(process.argv[2] ?? '')
  .trim()
  .toLowerCase();
const expiresInDays = Number(process.argv[3] ?? 14);
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.chicmagnolia.com';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail('Pass the invited email address as the first argument.');
}
if (
  !Number.isInteger(expiresInDays) ||
  expiresInDays < 1 ||
  expiresInDays > 90
) {
  fail('Invitation expiry must be a whole number from 1 to 90 days.');
}
if (!supabaseUrl || !serviceRoleKey) {
  fail(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be available in the environment.',
  );
}

const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
const expiresAt = new Date(
  Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
).toISOString();
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error } = await supabase.from('beta_invites').insert({
  token_hash: tokenHash,
  invited_email: email,
  expires_at: expiresAt,
});

if (error) fail(`Invitation could not be created: ${error.message}`);

const inviteUrl = new URL('/sign-up', appUrl);
inviteUrl.searchParams.set('invite', token);

console.log(`Private beta invitation created for ${email}.`);
console.log(`Invitation expires at ${expiresAt}.`);
console.log(`Invite link: ${inviteUrl.toString()}`);
console.log(
  'The plaintext token is shown only in this output. Share it privately.',
);
