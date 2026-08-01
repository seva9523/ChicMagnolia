import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthForm } from './auth-form';

describe('AuthForm', () => {
  it('requires legal acknowledgement during sign-up', () => {
    render(<AuthForm action={async () => undefined} mode="sign-up" />);

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
  });
});
