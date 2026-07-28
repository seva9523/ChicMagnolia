import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Home from './page';

describe('Home', () => {
  it('confirms that the Sprint 0 foundation is running', () => {
    render(<Home />);

    expect(
      screen.getByText('Sprint 0 foundation is running'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View system health' }),
    ).toHaveAttribute('href', '/api/health');
  });
});
