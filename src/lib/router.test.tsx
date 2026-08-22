import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate, pageScrollTop } = vi.hoisted(() => ({
  navigate: vi.fn(),
  pageScrollTop: vi.fn(() => 720),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/', search: '', hash: '' }),
  useNavigate: () => navigate,
  useParams: () => ({}),
}));

vi.mock('@/lib/scroll', () => ({ pageScrollTop }));

import { useRouter } from '@/lib/router';

describe('useRouter scroll persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    navigate.mockClear();
    pageScrollTop.mockClear();
  });

  it('stores the active page scroller before opening a subject', () => {
    const { result } = renderHook(() => useRouter());

    act(() => result.current.navigate('/subject/subject-1'));

    expect(pageScrollTop).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('jpu-it-hub:scroll:/')).toBe('720');
    expect(navigate).toHaveBeenCalledWith('/subject/subject-1');
  });
});
