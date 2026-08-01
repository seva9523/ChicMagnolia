import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
  })),
}));

import SupportPage from './page';

describe('Support page', () => {
  it('offers monitored account, billing, retailer, privacy and security support', async () => {
    render(await SupportPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeRequired();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Topic')).toBeRequired();
    expect(screen.getByRole('option', { name: 'Billing' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Privacy request' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Security report' })).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveAttribute('minLength', '20');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});
