import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exchangeCodeForSession } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession },
  })),
}));

import { GET } from './route';

const origin = 'https://preview.example.vercel.app';

function location(response: Response) {
  const value = response.headers.get('location');
  if (!value) throw new Error('Expected a redirect location.');
  return new URL(value);
}

describe('auth callback', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
  });

  it('exchanges the code and redirects to the requested local path', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      new Request(`${origin}/auth/callback?code=valid&next=%2Fdashboard`),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith('valid');
    expect(location(response).toString()).toBe(`${origin}/dashboard`);
  });

  it('does not report a false confirmation failure when PKCE auto-sign-in fails', async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: new Error('both auth code and code verifier should be non-empty'),
    });

    const response = await GET(
      new Request(`${origin}/auth/callback?code=confirmed&next=%2Fdashboard`),
    );
    const target = location(response);

    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('error')).toBeNull();
    expect(target.searchParams.get('message')).toMatch(/email was confirmed/i);
  });

  it('requires a fresh recovery link when the reset session cannot be opened', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error('bad code verifier') });

    const response = await GET(
      new Request(`${origin}/auth/callback?code=recovery&next=%2Freset-password`),
    );
    const target = location(response);

    expect(target.pathname).toBe('/forgot-password');
    expect(target.searchParams.get('error')).toMatch(/secure session/i);
  });

  it('blocks protocol-relative next destinations', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      new Request(`${origin}/auth/callback?code=valid&next=%2F%2Fattacker.example`),
    );

    expect(location(response).toString()).toBe(`${origin}/dashboard`);
  });
});
