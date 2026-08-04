import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

const inviteTokenPattern = /^[A-Za-z0-9_-]{32,128}$/;

export type BetaAccessGrant = {
  user_id: string;
  invite_id: string;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

type BetaInviteRecord = {
  token_hash: string;
  invited_email: string | null;
  expires_at: string;
  grant_expires_at: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
};

export type BetaInviteValidationReason =
  | 'invalid_token'
  | 'not_found'
  | 'expired'
  | 'redeemed'
  | 'revoked'
  | 'email_mismatch';

export type BetaInviteValidation =
  | { ok: true; tokenHash: string }
  | { ok: false; reason: BetaInviteValidationReason };

function validFutureDate(value: string | null, now: Date) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function normalizeBetaEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isBetaInviteToken(value: string) {
  return inviteTokenPattern.test(value.trim());
}

export function hashBetaInviteToken(token: string) {
  const normalized = token.trim();
  if (!isBetaInviteToken(normalized)) {
    throw new Error('Invalid private beta invitation token.');
  }
  return createHash('sha256').update(normalized).digest('hex');
}

export function hasPrivateBetaAccess(
  grant: BetaAccessGrant | null | undefined,
  now = new Date(),
) {
  if (!grant || grant.revoked_at) return false;

  const startsAt = new Date(grant.starts_at).getTime();
  if (!Number.isFinite(startsAt) || startsAt > now.getTime()) return false;

  return validFutureDate(grant.expires_at, now);
}

export function betaAccessStatusLabel(
  grant: BetaAccessGrant | null | undefined,
  now = new Date(),
) {
  if (!grant) return 'No private beta access';
  if (grant.revoked_at) return 'Private beta access revoked';
  if (!hasPrivateBetaAccess(grant, now)) return 'Private beta access ended';
  return 'Private beta access';
}

function validateInviteRecord(
  invite: BetaInviteRecord | null,
  email: string,
  now: Date,
): BetaInviteValidationReason | null {
  if (!invite) return 'not_found';
  if (invite.revoked_at) return 'revoked';
  if (invite.redeemed_at) return 'redeemed';
  if (!validFutureDate(invite.expires_at, now)) return 'expired';
  if (!validFutureDate(invite.grant_expires_at, now)) return 'expired';
  if (
    invite.invited_email &&
    normalizeBetaEmail(invite.invited_email) !== normalizeBetaEmail(email)
  ) {
    return 'email_mismatch';
  }
  return null;
}

export async function validateBetaInviteForSignup(
  admin: SupabaseClient,
  token: string,
  email: string,
  now = new Date(),
): Promise<BetaInviteValidation> {
  if (!isBetaInviteToken(token)) {
    return { ok: false, reason: 'invalid_token' };
  }

  const tokenHash = hashBetaInviteToken(token);
  const { data, error } = await admin
    .from('beta_invites')
    .select(
      'token_hash, invited_email, expires_at, grant_expires_at, redeemed_at, revoked_at',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const reason = validateInviteRecord(
    (data as BetaInviteRecord | null) ?? null,
    email,
    now,
  );
  return reason ? { ok: false, reason } : { ok: true, tokenHash };
}

export function betaInviteErrorMessage(reason: BetaInviteValidationReason) {
  if (reason === 'email_mismatch') {
    return 'Use the email address that received this private beta invitation.';
  }
  if (reason === 'expired') {
    return 'This private beta invitation has expired. Ask for a new invitation.';
  }
  return 'This private beta invitation is invalid or no longer available.';
}

export async function redeemBetaInviteForUser(
  admin: SupabaseClient,
  tokenHash: string,
  userId: string,
  email: string,
) {
  const { data, error } = await admin.rpc('redeem_beta_invite', {
    p_token_hash: tokenHash,
    p_user_id: userId,
    p_email: normalizeBetaEmail(email),
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Private beta access was not created.');
  return String(data);
}

export async function getUserBetaAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<BetaAccessGrant | null> {
  const { data, error } = await supabase
    .from('beta_access_grants')
    .select('user_id, invite_id, starts_at, expires_at, revoked_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as BetaAccessGrant | null) ?? null;
}
