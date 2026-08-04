import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SUPPORTED_RETAILER_NAMES } from '@/retailers/catalog';

import Home from './page';

describe('Home', () => {
  it('offers account creation and sign-in', () => {
    render(<Home />);

    expect(
      screen.getByText('Catch price drops before your return window closes.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Create account' }),
    ).toHaveAttribute('href', '/sign-up');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('shows only retailers that are implemented in the private beta', () => {
    render(<Home />);

    expect(
      screen.getByText('Currently supported UK retailers'),
    ).toBeInTheDocument();
    for (const retailer of SUPPORTED_RETAILER_NAMES) {
      expect(screen.getByText(retailer)).toBeInTheDocument();
    }
    expect(screen.queryByText('Massimo Dutti')).not.toBeInTheDocument();
    expect(screen.queryByText('& Other Stories')).not.toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
    expect(
      screen.getByText('More retailers will be added during the private beta.'),
    ).toBeInTheDocument();
  });
});
