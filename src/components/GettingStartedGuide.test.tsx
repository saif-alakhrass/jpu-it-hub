import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GettingStartedGuide } from './GettingStartedGuide';
import { isNewAccount } from '@/lib/gettingStartedGuide';

const auth = vi.hoisted(() => ({
  createdAt: new Date().toISOString(),
  loading: false,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    loading: auth.loading,
    session: {
      user: { id: 'new-student', created_at: auth.createdAt },
    },
  }),
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  auth.createdAt = new Date().toISOString();
  auth.loading = false;
});

afterEach(cleanup);

describe('GettingStartedGuide', () => {
  it('shows the guide for a new account and remembers when the video is opened', () => {
    render(<GettingStartedGuide />);
    const link = screen.getByRole('link', { name: 'مشاهدة شرح الموقع' });
    expect(link.getAttribute('href')).toBe('https://youtu.be/xrOujveUoBw');

    fireEvent.click(link);
    expect(screen.queryByLabelText('شرح استخدام الموقع')).toBeNull();
    expect(localStorage.getItem('jpu-it-hub:getting-started-guide:new-student')).toContain('"completed":true');
  });

  it('does not interrupt an established account', () => {
    auth.createdAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    render(<GettingStartedGuide />);
    expect(screen.queryByLabelText('شرح استخدام الموقع')).toBeNull();
  });

  it('recognizes only valid accounts created during the onboarding window', () => {
    const now = Date.now();
    expect(isNewAccount(new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe(true);
    expect(isNewAccount(new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe(false);
    expect(isNewAccount('invalid', now)).toBe(false);
  });
});
