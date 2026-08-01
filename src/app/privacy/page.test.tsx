import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PrivacyPage from './page';

describe('Privacy notice', () => {
  it('explains export, deletion, processors, support records and user rights', () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { name: 'Privacy notice' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Service providers and recipients/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Your rights/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Account deletion/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Settings page provides a JSON download/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Support data:/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /secure support form/i }),
    ).toHaveAttribute('href', '/support');
  });
});
