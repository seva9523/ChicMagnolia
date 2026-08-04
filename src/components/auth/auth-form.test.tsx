import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AuthForm } from './auth-form';

afterEach(cleanup);

describe('AuthForm', () => {
  it('blocks direct sign-up without a private beta invitation', () => {
    render(<AuthForm action={async () => undefined} mode="sign-up" />);

    expect(
      screen.getByRole('heading', { name: 'Private beta is invite-only' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('requires legal acknowledgement for an invited sign-up', () => {
    const { container } = render(
      <AuthForm
        action={async () => undefined}
        mode="sign-up"
        inviteToken="a-valid-private-beta-token-1234567890"
      />,
    );

    expect(screen.getByRole('checkbox')).toBeRequired();
    expect(
      screen.getByRole('link', { name: 'Terms of service' }),
    ).toHaveAttribute('href', '/terms');
    expect(
      screen.getByRole('link', { name: 'Privacy notice' }),
    ).toHaveAttribute('href', '/privacy');
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    expect(
      screen.getByText(/No payment is required during the beta/i),
    ).toBeInTheDocument();
    expect(
      container.querySelector('input[name="betaInviteToken"]'),
    ).toHaveValue('a-valid-private-beta-token-1234567890');
  });
});
