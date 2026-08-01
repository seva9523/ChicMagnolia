import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import TermsPage from './page';

describe('Terms of service', () => {
  it('states retailer, billing and consumer-right limitations clearly', () => {
    render(<TermsPage />);

    expect(screen.getByRole('heading', { name: 'Terms of service' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Important retailer limitations/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Subscription and billing/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing in these terms removes a statutory/i)).toBeInTheDocument();
  });
});
