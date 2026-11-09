import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { App } from './App.js';
afterEach(cleanup);
test('offers an accessible landing page with truthful status', () => {
  render(<App />);
  expect(screen.getByRole('main')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1, name: 'Archwise' })).toBeTruthy();
  expect(screen.getByText(/not implemented/i)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
